import { Hono } from 'hono';
import { AppError, normalizeCommercialMarketing, normalizePaidPackageModules } from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  issueCommercialOfferSchema,
  assignStarterWorkOrderSchema,
  listPackageIntakesSchema,
  parseInput,
  reviewPackageIntakeSchema,
  updateStarterWorkOrderStatusSchema,
  publishStarterWorkOrderSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { requireWrite } from '../middleware/auth';

export const commercialIntakesAdmin = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

commercialIntakesAdmin.get('/', async (c) => {
  const input = parseInput(listPackageIntakesSchema, {
    status: c.req.query('status') || undefined,
    limit: c.req.query('limit') || undefined,
  });
  const intakes = await createRepositories(c.env.DB).lmwaresPackageIntakes.listForReview(input);
  return c.json({ intakes });
});

commercialIntakesAdmin.get('/:id', async (c) => {
  const repos = createRepositories(c.env.DB);
  const intake = await repos.lmwaresPackageIntakes.getById(c.req.param('id'));
  if (!intake) throw AppError.notFound('Solicitud comercial');
  const offers = await repos.lmwaresCommercialOffers.listForIntake(intake.id);
  const acceptedOffer = offers.find((offer) => offer.status === 'accepted') ?? null;
  const billingOrder = acceptedOffer
    ? await repos.lmwaresBillingOrders.getByOfferId(acceptedOffer.id)
    : null;
  const workOrder = await repos.lmwaresStarterWorkOrders.getByIntakeId(intake.id);
  const maintenanceSubscription = workOrder
    ? await repos.lmwaresMaintenanceSubscriptions.getByWorkOrderId(workOrder.id)
    : null;
  return c.json({ intake, offers, billingOrder, workOrder, maintenanceSubscription });
});

commercialIntakesAdmin.post('/:id/work-order/assign', requireWrite, async (c) => {
  const input = parseInput(assignStarterWorkOrderSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const workOrder = await repos.lmwaresStarterWorkOrders.getByIntakeId(c.req.param('id')!);
  if (!workOrder) throw AppError.notFound('Orden de trabajo');
  const updated = await repos.lmwaresStarterWorkOrders.assignProject({
    id: workOrder.id,
    projectId: input.projectId,
    assignedBy: c.get('admin').email,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.starter_work_order.project_assigned',
    entityType: 'lmwares_starter_work_order',
    entityId: updated.id,
    metadata: { intakeId: updated.intakeId, projectId: updated.projectId, status: updated.status },
  });
  return c.json({ workOrder: updated });
});

commercialIntakesAdmin.patch('/:id/work-order/status', requireWrite, async (c) => {
  const input = parseInput(updateStarterWorkOrderStatusSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const workOrder = await repos.lmwaresStarterWorkOrders.getByIntakeId(c.req.param('id')!);
  if (!workOrder) throw AppError.notFound('Orden de trabajo');
  const updated = await repos.lmwaresStarterWorkOrders.setStatus({
    id: workOrder.id,
    status: input.status,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.starter_work_order.status_changed',
    entityType: 'lmwares_starter_work_order',
    entityId: updated.id,
    metadata: { intakeId: updated.intakeId, projectId: updated.projectId, status: updated.status },
  });
  return c.json({ workOrder: updated });
});

commercialIntakesAdmin.post('/:id/work-order/go-live', requireWrite, async (c) => {
  const input = parseInput(publishStarterWorkOrderSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const workOrder = await repos.lmwaresStarterWorkOrders.getByIntakeId(c.req.param('id')!);
  if (!workOrder) throw AppError.notFound('Orden de trabajo');
  const updated = await repos.lmwaresStarterWorkOrders.publish({
    id: workOrder.id,
    publicUrl: input.publicUrl,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.starter_work_order.go_live',
    entityType: 'lmwares_starter_work_order',
    entityId: updated.id,
    metadata: {
      intakeId: updated.intakeId,
      projectId: updated.projectId,
      publicUrl: updated.publishedUrl,
      publishedAt: updated.publishedAt,
    },
  });
  return c.json({ workOrder: updated });
});

commercialIntakesAdmin.patch('/:id/review', requireWrite, async (c) => {
  const input = parseInput(reviewPackageIntakeSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const intake = await repos.lmwaresPackageIntakes.review({
    id: c.req.param('id')!,
    status: input.status,
    reviewedBy: c.get('admin').email,
    notes: input.notes ?? null,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: `lmwares.package_intake.${input.status}`,
    entityType: 'lmwares_package_intake',
    entityId: intake.id,
    metadata: { status: intake.status, maintenanceStartPolicy: intake.maintenanceStartPolicy },
  });
  return c.json({ intake });
});

commercialIntakesAdmin.post('/:id/offers', requireWrite, async (c) => {
  const input = parseInput(issueCommercialOfferSchema, await readJson(c));
  const validUntilMs = Date.parse(input.validUntil);
  const nowMs = Date.now();
  if (validUntilMs < nowMs + 60 * 60 * 1000 || validUntilMs > nowMs + 90 * 24 * 60 * 60 * 1000) {
    throw new AppError('validation_error', 'La oferta debe vencer entre una hora y 90 días.');
  }
  const modules = normalizePaidPackageModules(input.plan, input.modules);
  const marketing = normalizeCommercialMarketing(input.marketing);
  const repos = createRepositories(c.env.DB);
  const offer = await repos.lmwaresCommercialOffers.issue({
    intakeId: c.req.param('id')!,
    plan: input.plan,
    modules,
    marketing,
    implementationAmountCents: input.implementationAmountCents,
    monthlyAmountCents: input.monthlyAmountCents,
    scopeSummary: input.scopeSummary,
    implementationDescription: input.implementationDescription,
    recurringDescription: input.recurringDescription,
    termsVersion: 'lmwares-commercial-terms-2026-07-v1',
    termsSnapshot: {
      schema: 'lmwares.commercial-terms.v1',
      maintenanceStartPolicy: 'on_go_live',
      implementationPayment: 'La implementación se cobra después de aceptar esta oferta.',
      recurringStart: input.monthlyAmountCents > 0
        ? 'La mensualidad comienza al publicar el proyecto, no durante la construcción.'
        : 'Esta oferta es de pago único y no crea una mensualidad de mantenimiento.',
      initialHosting: 'El proyecto inicia en un subdominio LMWares y puede migrar después a un dominio personalizado.',
      cancellation: input.monthlyAmountCents > 0
        ? 'La cancelación de la mensualidad detiene el mantenimiento futuro; no revierte trabajo de implementación ya entregado.'
        : 'No existen renovaciones automáticas ni cobros futuros asociados a esta oferta.',
      support: 'soporte@lmwares.com',
    },
    validUntil: input.validUntil,
    issuedBy: c.get('admin').email,
  });
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.commercial_offer.issue',
    entityType: 'lmwares_commercial_offer',
    entityId: offer.id,
    metadata: {
      intakeId: offer.intakeId,
      version: offer.version,
      implementationAmountCents: offer.implementationAmountCents,
      monthlyAmountCents: offer.monthlyAmountCents,
      termsVersion: offer.termsVersion,
    },
  });
  return c.json({ offer }, 201);
});

commercialIntakesAdmin.post('/:id/implementation-payment/reopen', requireWrite, async (c) => {
  const repos = createRepositories(c.env.DB);
  const intakeId = c.req.param('id')!;
  const result = await repos.lmwaresBillingOrders.cancelExpiredImplementationAndReopen({
    intakeId,
  });
  const intake = await repos.lmwaresPackageIntakes.getById(intakeId);
  if (!intake) throw AppError.notFound('Solicitud comercial');
  const offers = await repos.lmwaresCommercialOffers.listForIntake(intakeId);
  if (result.changed) {
    await repos.audit.record({
      actorType: 'admin',
      actorId: c.get('admin').email,
      action: 'lmwares.billing_order.expired_checkout_reopened',
      entityType: 'lmwares_billing_order',
      entityId: result.order.id,
      metadata: {
        intakeId,
        commercialOfferId: result.order.commercialOfferId,
        amountCents: result.order.amountCents,
        previousCheckoutExpiresAt: result.order.checkoutExpiresAt,
      },
    });
  }
  return c.json({ intake, offers, billingOrder: result.order });
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'El cuerpo JSON es inválido.');
  }
}
