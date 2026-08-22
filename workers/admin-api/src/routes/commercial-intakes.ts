import { Hono, type Context } from 'hono';
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
  const billingOrders = acceptedOffer
    ? await repos.lmwaresBillingOrders.getPhasesForOffer(acceptedOffer.id)
    : [];
  const workOrder = await repos.lmwaresStarterWorkOrders.getByIntakeId(intake.id);
  const [maintenanceSubscription, clientProject] = workOrder
    ? await Promise.all([
        repos.lmwaresMaintenanceSubscriptions.getByWorkOrderId(workOrder.id),
        repos.lmwaresStarterClientProjects.getByWorkOrderId(workOrder.id),
      ])
    : [null, null];
  return c.json({ intake, offers, billingOrders, workOrder, clientProject, maintenanceSubscription });
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
  await notifyGoogleIndexingBestEffort(c, repos, updated);
  return c.json({ workOrder: updated });
});

/**
 * Notifica a Google Indexing API la URL canónica del sitio recién publicado.
 * Regla de negocio: sin mantenimiento activo, o con mantenimiento pero sin
 * dominio propio `active`, se indexa el subdominio `slug.sitios.lmwares.com`
 * (el `publicUrl` guardado). Con mantenimiento activo Y un dominio propio ya
 * `active`, se indexa ese dominio en su lugar. Nunca bloquea ni falla la
 * respuesta HTTP: cualquier error (credenciales ausentes, red, cuota) se
 * registra en auditoría y se ignora.
 */
async function notifyGoogleIndexingBestEffort(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  repos: ReturnType<typeof createRepositories>,
  workOrder: { id: string; intakeId: string; publishedUrl: string | null },
) {
  if (!workOrder.publishedUrl) return;
  const token = c.env.OPS_RECOVERY_TOKEN?.trim();
  if (!token || !c.env.PUBLIC_API_URL) return;

  let urlToIndex = workOrder.publishedUrl;
  try {
    const [clientProject, offers] = await Promise.all([
      repos.lmwaresStarterClientProjects.getByWorkOrderId(workOrder.id),
      repos.lmwaresCommercialOffers.listForIntake(workOrder.intakeId),
    ]);
    const acceptedOffer = offers.find((offer) => offer.status === 'accepted') ?? null;
    const maintenanceActive =
      acceptedOffer?.maintenancePlanSelected === 'basic' ||
      acceptedOffer?.maintenancePlanSelected === 'advanced';
    if (maintenanceActive && clientProject) {
      const domains = await repos.lmwaresCustomDomains.listForAdmin(clientProject.id);
      const activeDomain = domains.find((domain) => domain.status === 'active') ?? null;
      if (activeDomain) {
        urlToIndex = `https://${activeDomain.hostname}`;
      }
    }
  } catch (error) {
    console.warn('google_indexing_url_resolution_failed', {
      workOrderId: workOrder.id,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }

  try {
    const response = await fetch(`${c.env.PUBLIC_API_URL}/internal/google-indexing/notify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: urlToIndex }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; reason?: string }
      | null;
    await repos.audit.record({
      actorType: 'admin',
      actorId: c.get('admin').email,
      action: 'lmwares.starter_work_order.google_indexing_notified',
      entityType: 'lmwares_starter_work_order',
      entityId: workOrder.id,
      metadata: { url: urlToIndex, ok: payload?.ok ?? false, reason: payload?.reason ?? null },
    });
  } catch (error) {
    console.warn('google_indexing_notify_failed', {
      workOrderId: workOrder.id,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

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
  const billingOrders = result.order.commercialOfferId
    ? await repos.lmwaresBillingOrders.getPhasesForOffer(result.order.commercialOfferId)
    : [];
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
  return c.json({ intake, offers, billingOrder: result.order, billingOrders });
});

/**
 * Fixture local para recorrer el flujo posterior al pago sin abrir Checkout ni
 * generar una transacción con Mercado Pago. El binding lo mantiene apagado en
 * producción y cada fase conserva una referencia explícita de prueba.
 */
commercialIntakesAdmin.post('/:id/implementation-payments/mark-test-paid', requireWrite, async (c) => {
  if (c.env.TEST_FIXTURES_ENABLED !== '1') {
    throw new AppError('forbidden', 'Los fixtures de pago están deshabilitados en este entorno.');
  }
  const repos = createRepositories(c.env.DB);
  const intakeId = c.req.param('id')!;
  const offers = await repos.lmwaresCommercialOffers.listForIntake(intakeId);
  const acceptedOffer = offers.find((offer) => offer.status === 'accepted');
  if (!acceptedOffer) {
    throw new AppError('conflict', 'Primero crea y acepta una oferta para preparar sus cuatro fases.');
  }
  const phases = await repos.lmwaresBillingOrders.getPhasesForOffer(acceptedOffer.id);
  if (phases.length !== 4 || phases.some((order, index) => order.phase !== index + 1)) {
    throw new AppError('conflict', 'La oferta no tiene las cuatro fases de implementación preparadas.');
  }
  for (const order of phases) {
    if (order.status === 'paid') continue;
    await repos.lmwaresBillingOrders.reconcilePayment({
      id: order.id,
      paymentId: `test-fixture-${order.id}`,
      providerStatus: 'approved',
      amountCents: order.amountCents,
      currency: order.currency,
      providerCreatedAt: new Date().toISOString(),
    });
  }
  const billingOrders = await repos.lmwaresBillingOrders.getPhasesForOffer(acceptedOffer.id);
  const workOrder = await repos.lmwaresStarterWorkOrders.getByIntakeId(intakeId);
  const clientProject = workOrder
    ? await repos.lmwaresStarterClientProjects.getByWorkOrderId(workOrder.id)
    : null;
  await repos.audit.record({
    actorType: 'admin',
    actorId: c.get('admin').email,
    action: 'lmwares.billing_order.test_fixture_all_phases_paid',
    entityType: 'lmwares_commercial_offer',
    entityId: acceptedOffer.id,
    metadata: { intakeId, phaseOrderIds: billingOrders.map((order) => order.id), environment: 'local' },
  });
  return c.json({ billingOrders, workOrder, clientProject });
});

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'El cuerpo JSON es inválido.');
  }
}
