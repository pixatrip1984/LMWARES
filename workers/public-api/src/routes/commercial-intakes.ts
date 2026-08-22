import { Hono } from 'hono';
import {
  AppError,
  estimateCommercialPackage,
  normalizeCommercialMarketing,
  normalizePaidPackageModules,
  type PackageIntake,
} from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  acceptCommercialOfferSchema,
  createPackageIntakeSchema,
  parseInput,
  previewDiscountCodeSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { assertTrustedPublicOrigin, requirePublicSession } from '../middleware/public-auth';
import { publicCommercialOffer } from '../lib/commercial-offer-public';
import { publicBillingOrder } from '../lib/billing-order-public';

export const commercialIntakes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

commercialIntakes.post('/', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const submissionKey = c.req.header('Idempotency-Key')?.trim().toLowerCase() ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(submissionKey)) {
    throw new AppError('validation_error', 'Falta una clave de envío válida.');
  }
  const input = parseInput(createPackageIntakeSchema, await readJson(c));
  const modules = normalizePaidPackageModules(input.plan, input.modules);
  const marketing = normalizeCommercialMarketing(input.marketing);
  const estimate = estimateCommercialPackage({ ...input, modules, marketing });
  const repos = createRepositories(c.env.DB);

  // Reintento idempotente: si ya existe un intake para esta clave, devuélvelo
  // tal cual sin volver a consumir el código de descuento.
  const existing = await repos.lmwaresPackageIntakes.getBySubmissionKey(submissionKey);
  if (existing && existing.userId === session.user.id) {
    return c.json({ intake: publicIntake(existing) }, 200);
  }

  // El código de descuento se guarda en el intake pero NO se consume aquí.
  // El consumo ocurre de forma atómica al ACEPTAR la oferta, de modo que solo
  // cuentan las solicitudes que llegan a oferta aceptada (no las que solo se
  // envían). El importe estimado se guarda sin descuento; el descuento se
  // aplica sobre el importe de la oferta al aceptarla.
  const discountCode = input.discountCode ?? null;

  const result = await repos.lmwaresPackageIntakes.create({
    submissionKey,
    userId: session.user.id,
    plan: input.plan,
    modules,
    marketing,
    brief: input.brief,
    estimatedImplementationCents: estimate.implementationAmountCents,
    estimatedMonthlyCents: estimate.estimatedMonthlyAmountCents,
    pricingVersion: estimate.pricingVersion,
    packageSnapshot: {
      schema: 'lmwares.commercial-intake.v1',
      plan: input.plan,
      modules,
      marketing,
      estimate,
      discountCode,
      discountPercent: null,
      maintenanceStartPolicy: 'on_go_live',
    },
    discountCode,
    discountPercent: null,
    discountRedemptionId: null,
  });
  if (result.created) {
    await repos.audit.record({
      actorType: 'public',
      actorId: session.user.id,
      action: 'lmwares.package_intake.submit',
      entityType: 'lmwares_package_intake',
      entityId: result.intake.id,
      metadata: {
        plan: result.intake.plan,
        modules: result.intake.modules,
        pricingVersion: result.intake.pricingVersion,
        maintenanceStartPolicy: result.intake.maintenanceStartPolicy,
      },
      ip: c.req.header('CF-Connecting-IP') ?? null,
      userAgent: c.req.header('User-Agent') ?? null,
    });
  }
  return c.json({ intake: publicIntake(result.intake) }, result.created ? 201 : 200);
});

commercialIntakes.get('/', async (c) => {
  const session = await requirePublicSession(c);
  const intakes = await createRepositories(c.env.DB).lmwaresPackageIntakes.listForUser(
    session.user.id,
  );
  c.header('Cache-Control', 'no-store');
  return c.json({ intakes: intakes.map(publicIntake) });
});

commercialIntakes.post('/discount-preview', async (c) => {
  assertTrustedPublicOrigin(c);
  await requirePublicSession(c);
  const input = parseInput(previewDiscountCodeSchema, await readJson(c));
  const application = await createRepositories(c.env.DB).lmwaresDiscountCodes.preview({
    code: input.code,
    plan: input.plan,
    originalCents: input.originalCents,
  });
  return c.json({ application });
});

commercialIntakes.get('/:id', async (c) => {
  const session = await requirePublicSession(c);
  const intake = await createRepositories(c.env.DB).lmwaresPackageIntakes.getById(
    c.req.param('id'),
  );
  if (!intake || intake.userId !== session.user.id) {
    throw AppError.notFound('Solicitud comercial');
  }
  c.header('Cache-Control', 'no-store');
  const offers = await createRepositories(c.env.DB).lmwaresCommercialOffers.listForIntake(intake.id);
  return c.json({
    intake: publicIntake(intake),
    offers: offers.map(publicCommercialOffer),
  });
});

commercialIntakes.post('/:id/offers/:offerId/accept', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const input = parseInput(acceptCommercialOfferSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const intake = await repos.lmwaresPackageIntakes.getById(c.req.param('id'));
  if (!intake || intake.userId !== session.user.id) throw AppError.notFound('Solicitud comercial');
  const result = await repos.lmwaresCommercialOffers.accept({
    id: c.req.param('offerId')!,
    intakeId: intake.id,
    userId: session.user.id,
    termsVersion: input.termsVersion,
  });

  // El canje se puede recuperar si una petición anterior se interrumpió entre
  // el registro del descuento y la actualización de la oferta. Esto evita
  // duplicar usos y garantiza que las fases siempre se calculen sobre el total
  // descontado.
  let offer = result.offer;
  let redemption = intake.discountRedemptionId
    ? await repos.lmwaresDiscountCodes.getRedemptionById(intake.discountRedemptionId)
    : null;
  if (intake.discountRedemptionId && !redemption) {
    throw new AppError('conflict', 'El canje del descuento no está disponible para reintentar la aceptación.');
  }
  if (
    redemption &&
    (redemption.userId !== session.user.id || redemption.intakeId !== intake.id)
  ) {
    throw new AppError('conflict', 'El canje del descuento no pertenece a esta solicitud.');
  }
  if (redemption && !intake.discountCode) {
    throw new AppError('conflict', 'La solicitud tiene un canje de descuento sin código asociado.');
  }
  if (intake.discountCode && !redemption) {
    redemption = (
      await repos.lmwaresDiscountCodes.redeem({
        code: intake.discountCode,
        plan: intake.plan,
        userId: session.user.id,
        intakeId: intake.id,
        originalCents: offer.implementationAmountCents,
      })
    ).redemption;
  }
  if (redemption) {
    const discounted = await repos.lmwaresCommercialOffers.applyDiscountToOffer({
      offerId: offer.id,
      userId: session.user.id,
      discountedCents: redemption.discountedCents,
    });
    await repos.lmwaresPackageIntakes.markDiscountRedeemed({
      id: intake.id,
      discountPercent: redemption.discountPercent,
      discountRedemptionId: redemption.id,
    });
    offer = discounted.offer;
  }

  const billingOrders = await repos.lmwaresBillingOrders.ensureImplementationPhases({
    offerId: offer.id,
    intakeId: intake.id,
    userId: session.user.id,
  });
  if (result.changed) {
    await repos.audit.record({
      actorType: 'public',
      actorId: session.user.id,
      action: 'lmwares.commercial_offer.accept',
      entityType: 'lmwares_commercial_offer',
      entityId: offer.id,
      metadata: {
        intakeId: intake.id,
        version: offer.version,
        termsVersion: offer.termsVersion,
        implementationAmountCents: offer.implementationAmountCents,
        monthlyAmountCents: offer.monthlyAmountCents,
        discountCode: intake.discountCode,
        discountPercent: redemption?.discountPercent ?? intake.discountPercent,
      },
      ip: c.req.header('CF-Connecting-IP') ?? null,
      userAgent: c.req.header('User-Agent') ?? null,
    });
  }
  return c.json({
    offer: publicCommercialOffer(offer),
    billingOrders: billingOrders.map(publicBillingOrder),
  });
});

function publicIntake(intake: PackageIntake) {
  return {
    id: intake.id,
    plan: intake.plan,
    modules: intake.modules,
    marketing: intake.marketing,
    brief: intake.brief,
    status: intake.status,
    estimatedImplementationCents: intake.estimatedImplementationCents,
    estimatedMonthlyCents: intake.estimatedMonthlyCents,
    currency: intake.currency,
    pricingVersion: intake.pricingVersion,
    maintenanceStartPolicy: intake.maintenanceStartPolicy,
    discountCode: intake.discountCode,
    discountPercent: intake.discountPercent,
    proposalId: intake.proposalId,
    currentOffer: null,
    submittedAt: intake.submittedAt,
    updatedAt: intake.updatedAt,
  };
}

async function readJson(c: Parameters<typeof requirePublicSession>[0]): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'El cuerpo JSON es inválido.');
  }
}
