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
  publishCommercialDemoSchema,
  completeCommercialPhaseSchema,
  commercialPhaseParamSchema,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import { requireApproval, requireWrite } from '../middleware/auth';
import {
  releaseArtifactPath,
  rewriteReleaseCssForReview,
  rewriteReleaseHtmlForReview,
} from '../lib/commercial-demo-review-routing';

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
  const lifecycle = await repos.lmwaresCommercialDemoLifecycles.getByIntakeId(intake.id);
  const demoPhases = lifecycle ? await repos.lmwaresCommercialDemoLifecycles.listPhases(lifecycle.id) : [];
  const agentJobs = await repos.lmwaresCommercialAgentJobs.listForIntake(intake.id);
  const [maintenanceSubscription, clientProject] = workOrder
    ? await Promise.all([
        repos.lmwaresMaintenanceSubscriptions.getByWorkOrderId(workOrder.id),
        repos.lmwaresStarterClientProjects.getByWorkOrderId(workOrder.id),
      ])
    : [null, null];
  return c.json({ intake, offers, billingOrders, workOrder, clientProject, maintenanceSubscription, lifecycle, demoPhases, agentJobs });
});

commercialIntakesAdmin.get('/:id/demo/review', async (c) => {
  const repos = createRepositories(c.env.DB);
  const job = await repos.lmwaresCommercialAgentJobs.getForIntake(c.req.param('id')!, 'demo');
  const assetKey = job?.result?.reviewAssetKey;
  if (typeof assetKey !== 'string' || !assetKey.startsWith('commercial-demos/')) throw AppError.notFound('Demo en revisión');
  const object = await c.env.MEDIA.get(assetKey);
  if (!object) throw AppError.notFound('Archivo de demo');
  const headers = new Headers(); object.writeHttpMetadata(headers);
  headers.set('content-type', 'text/html; charset=UTF-8'); headers.set('cache-control', 'no-store'); headers.set('x-robots-tag', 'noindex, nofollow');
  return new Response(object.body, { headers });
});

// Creative Studio releases are routed static sites. Keep their review surface
// behind Admin Access until a human explicitly attaches the release to the
// customer lifecycle.
commercialIntakesAdmin.get('/:id/demo/releases/:releaseId/review', async (c) => serveSubmittedReleaseReview(c, '/'));
commercialIntakesAdmin.get('/:id/demo/releases/:releaseId/review/*', async (c) => {
  const prefix = `/admin/commercial-intakes/${encodeURIComponent(c.req.param('id')!)}/demo/releases/${encodeURIComponent(c.req.param('releaseId')!)}/review`;
  const pathname = new URL(c.req.url).pathname;
  return serveSubmittedReleaseReview(c, pathname.startsWith(prefix) ? pathname.slice(prefix.length) || '/' : '/');
});

commercialIntakesAdmin.post('/:id/demo/approve', requireWrite, async (c) => {
  const repos = createRepositories(c.env.DB);
  const lifecycle = await repos.lmwaresCommercialDemoLifecycles.getByIntakeId(c.req.param('id')!);
  const job = await repos.lmwaresCommercialAgentJobs.getForIntake(c.req.param('id')!, 'demo');
  const assetKey = job?.result?.reviewAssetKey;
  if (!lifecycle || !job || job.status !== 'completed' || typeof assetKey !== 'string' || !assetKey.startsWith(`commercial-demos/${lifecycle.id}/`)) throw new AppError('conflict', 'No hay una demo terminada para aprobar.');
  const updated = await repos.lmwaresCommercialDemoLifecycles.publishDemo({ intakeId: lifecycle.intakeId, assetKey, actor: c.get('admin').email });
  await repos.audit.record({ actorType: 'admin', actorId: c.get('admin').email, action: 'lmwares.demo.agent_approved', entityType: 'lmwares_commercial_demo_lifecycle', entityId: updated.id, metadata: { jobId: job.id, assetKey } });
  return c.json({ lifecycle: updated });
});

commercialIntakesAdmin.post('/:id/demo/publish', requireWrite, async (c) => {
  const input = parseInput(publishCommercialDemoSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const lifecycle = await repos.lmwaresCommercialDemoLifecycles.getByIntakeId(c.req.param('id')!);
  if (!lifecycle) throw AppError.notFound('Demo comercial');
  const assetKey = `commercial-demos/${lifecycle.id}/index.html`;
  await c.env.MEDIA.put(assetKey, input.html, {
    httpMetadata: { contentType: 'text/html; charset=UTF-8', cacheControl: 'no-store' },
  });
  const updated = await repos.lmwaresCommercialDemoLifecycles.publishDemo({
    intakeId: lifecycle.intakeId,
    assetKey,
    actor: c.get('admin').email,
  });
  await repos.audit.record({
    actorType: 'admin', actorId: c.get('admin').email, action: 'lmwares.demo.published',
    entityType: 'lmwares_commercial_demo_lifecycle', entityId: updated.id,
    metadata: { intakeId: updated.intakeId, slug: updated.slug, assetKey },
  });
  return c.json({ lifecycle: updated });
});

commercialIntakesAdmin.post('/:id/phases/0/complete', requireWrite, async (c) => {
  const input = parseInput(completeCommercialPhaseSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const lifecycle = await repos.lmwaresCommercialDemoLifecycles.getByIntakeId(c.req.param('id')!);
  if (!lifecycle) throw AppError.notFound('Demo comercial');
  if (!lifecycle.demoAssetKey) {
    throw new AppError('conflict', 'Publica la demo en el subdominio antes de cerrar la fase 0.');
  }
  const updated = await repos.lmwaresCommercialDemoLifecycles.completePhaseZero({
    intakeId: lifecycle.intakeId, actor: c.get('admin').email, evidence: input.evidence,
  });
  await repos.audit.record({
    actorType: 'admin', actorId: c.get('admin').email, action: 'lmwares.demo.phase_0.completed',
    entityType: 'lmwares_commercial_demo_lifecycle', entityId: updated.id,
    metadata: { intakeId: updated.intakeId, evidence: input.evidence },
  });
  return c.json({ lifecycle: updated });
});

commercialIntakesAdmin.post('/:id/demo/releases/:releaseId/approve', requireApproval, async (c) => {
  const repos = createRepositories(c.env.DB);
  const lifecycle = await repos.lmwaresCommercialDemoLifecycles.getByIntakeId(c.req.param('id')!);
  if (!lifecycle) throw AppError.notFound('Demo comercial');
  const updated = await repos.lmwaresCommercialDemoLifecycles.attachApprovedRelease({
    lifecycleId: lifecycle.id,
    releaseId: c.req.param('releaseId')!,
    actor: c.get('admin').email,
    evidence: `release:${c.req.param('releaseId')!}`,
  });
  await repos.audit.record({
    actorType: 'admin', actorId: c.get('admin').email, action: 'lmwares.demo.release.approved',
    entityType: 'lmwares_commercial_demo_lifecycle', entityId: updated.id,
    metadata: { intakeId: updated.intakeId, releaseId: c.req.param('releaseId')!, slug: updated.slug },
  });
  return c.json({ lifecycle: updated });
});

commercialIntakesAdmin.post('/:id/phases/:phase/start', requireWrite, async (c) => {
  const phase = parseInput(commercialPhaseParamSchema, c.req.param('phase'));
  const repos = createRepositories(c.env.DB);
  const lifecycle = await repos.lmwaresCommercialDemoLifecycles.getByIntakeId(c.req.param('id')!);
  if (!lifecycle) throw AppError.notFound('Demo comercial');
  const order = (await repos.lmwaresBillingOrders.getPhasesForOffer(lifecycle.commercialOfferId)).find((item) => item.phase === phase);
  if (!order || order.status !== 'paid') throw new AppError('conflict', `La fase ${phase} requiere un pago confirmado antes de iniciar.`);
  const updated = await repos.lmwaresCommercialDemoLifecycles.startPhase({ intakeId: lifecycle.intakeId, phase, actor: c.get('admin').email });
  await repos.audit.record({ actorType: 'admin', actorId: c.get('admin').email, action: 'lmwares.demo.phase.started', entityType: 'lmwares_commercial_demo_lifecycle', entityId: lifecycle.id, metadata: { phase } });
  return c.json({ phase: updated });
});

commercialIntakesAdmin.post('/:id/phases/:phase/complete', requireWrite, async (c) => {
  const phase = parseInput(commercialPhaseParamSchema, c.req.param('phase'));
  const input = parseInput(completeCommercialPhaseSchema, await readJson(c));
  const repos = createRepositories(c.env.DB);
  const lifecycle = await repos.lmwaresCommercialDemoLifecycles.getByIntakeId(c.req.param('id')!);
  if (!lifecycle) throw AppError.notFound('Demo comercial');
  const updated = await repos.lmwaresCommercialDemoLifecycles.completePaidPhase({ intakeId: lifecycle.intakeId, phase, actor: c.get('admin').email, evidence: input.evidence });
  await repos.audit.record({ actorType: 'admin', actorId: c.get('admin').email, action: 'lmwares.demo.phase.completed', entityType: 'lmwares_commercial_demo_lifecycle', entityId: lifecycle.id, metadata: { phase, evidence: input.evidence } });
  return c.json({ phase: updated });
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

async function serveSubmittedReleaseReview(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  pathname: string,
): Promise<Response> {
  const repos = createRepositories(c.env.DB);
  const lifecycle = await repos.lmwaresCommercialDemoLifecycles.getByIntakeId(c.req.param('id')!);
  if (!lifecycle) throw AppError.notFound('Demo comercial');
  const release = await repos.lmwaresCommercialDemoCreativeStudio.getReleaseById(c.req.param('releaseId')!);
  if (!release || release.lifecycleId !== lifecycle.id) throw AppError.notFound('Release de demo');
  const artifactPath = releaseArtifactPath(release.artifactPrefix, release.routeManifest, pathname);
  if (!artifactPath) throw AppError.notFound('Ruta de demo');
  const object = await c.env.MEDIA.get(`${release.artifactPrefix}${artifactPath}`);
  if (!object) throw AppError.notFound('Archivo de demo');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  const basePath = `/admin/commercial-intakes/${encodeURIComponent(c.req.param('id')!)}/demo/releases/${encodeURIComponent(release.id)}/review/`;
  if (artifactPath.endsWith('.html')) {
    headers.set('content-type', 'text/html; charset=UTF-8');
    return new Response(rewriteReleaseHtmlForReview(await object.text(), basePath), { headers });
  }
  if (artifactPath.endsWith('.css')) {
    headers.set('content-type', 'text/css; charset=UTF-8');
    return new Response(rewriteReleaseCssForReview(await object.text(), basePath), { headers });
  }
  return new Response(object.body, { headers });
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'El cuerpo JSON es inválido.');
  }
}
