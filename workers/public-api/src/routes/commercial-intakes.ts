import { Hono } from 'hono';
import {
  AppError,
  estimateCommercialPackage,
  normalizePaidPackageModules,
  type PackageIntake,
} from '@starter/domain';
import { createRepositories } from '@starter/db';
import { createPackageIntakeSchema, parseInput } from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { assertTrustedPublicOrigin, requirePublicSession } from '../middleware/public-auth';

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
  const estimate = estimateCommercialPackage({ ...input, modules });
  const repos = createRepositories(c.env.DB);
  const result = await repos.lmwaresPackageIntakes.create({
    submissionKey,
    userId: session.user.id,
    plan: input.plan,
    modules,
    marketing: input.marketing,
    estimatedImplementationCents: estimate.implementationAmountCents,
    estimatedMonthlyCents: estimate.estimatedMonthlyAmountCents,
    pricingVersion: estimate.pricingVersion,
    packageSnapshot: {
      schema: 'lmwares.commercial-intake.v1',
      plan: input.plan,
      modules,
      marketing: input.marketing,
      estimate,
      maintenanceStartPolicy: 'on_go_live',
    },
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

commercialIntakes.get('/:id', async (c) => {
  const session = await requirePublicSession(c);
  const intake = await createRepositories(c.env.DB).lmwaresPackageIntakes.getById(
    c.req.param('id'),
  );
  if (!intake || intake.userId !== session.user.id) {
    throw AppError.notFound('Solicitud comercial');
  }
  c.header('Cache-Control', 'no-store');
  return c.json({ intake: publicIntake(intake) });
});

function publicIntake(intake: PackageIntake) {
  return {
    id: intake.id,
    plan: intake.plan,
    modules: intake.modules,
    marketing: intake.marketing,
    status: intake.status,
    estimatedImplementationCents: intake.estimatedImplementationCents,
    estimatedMonthlyCents: intake.estimatedMonthlyCents,
    currency: intake.currency,
    pricingVersion: intake.pricingVersion,
    maintenanceStartPolicy: intake.maintenanceStartPolicy,
    proposalId: intake.proposalId,
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
