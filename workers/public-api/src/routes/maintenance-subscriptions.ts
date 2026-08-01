import { Hono } from 'hono';
import { AppError, type MaintenanceSubscription } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';
import {
  cancelMercadoPagoPreapproval,
  createMercadoPagoPreapproval,
  findMercadoPagoPreapproval,
  getMercadoPagoPreapproval,
  mercadoPagoProviderDiagnostic,
  searchMercadoPagoAuthorizedPayments,
  type MercadoPagoPreapproval,
} from '../lib/mercado-pago';
import { publicMaintenanceSubscription } from '../lib/maintenance-subscription-public';
import { assertTrustedPublicOrigin, requirePublicSession } from '../middleware/public-auth';

export const maintenanceSubscriptions = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

maintenanceSubscriptions.get('/work-orders/:workOrderId', async (c) => {
  const session = await requirePublicSession(c);
  const workOrder = await ownedWorkOrder(c.env, c.req.param('workOrderId')!, session.user.id);
  const subscription = await createRepositories(c.env.DB)
    .lmwaresMaintenanceSubscriptions.getByWorkOrderId(workOrder.id);
  c.header('Cache-Control', 'no-store');
  return c.json({ subscription: subscription ? publicMaintenanceSubscription(subscription) : null });
});

maintenanceSubscriptions.post('/work-orders/:workOrderId', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const accessToken = maintenanceAccessToken(c.env);
  assertMaintenanceEnabled(c.env);
  const workOrder = await ownedWorkOrder(c.env, c.req.param('workOrderId')!, session.user.id);
  if (workOrder.status !== 'ready_to_publish') {
    throw new AppError('conflict', 'La mensualidad sólo se autoriza cuando el proyecto está listo para publicar.');
  }
  const repos = createRepositories(c.env.DB);
  const claim = await repos.lmwaresMaintenanceSubscriptions.claimCreation({
    workOrderId: workOrder.id,
    userId: session.user.id,
  });
  let subscription = claim.subscription;
  if (!claim.claimed) {
    if (!subscription.providerPreapprovalId) {
      throw new AppError('conflict', 'La mensualidad se está preparando. Intenta nuevamente en unos segundos.');
    }
    const provider = await getMercadoPagoPreapproval({
      accessToken,
      preapprovalId: subscription.providerPreapprovalId,
    });
    assertPreapprovalMatches(provider, subscription);
    subscription = await saveProvider(c.env, subscription, provider);
    return c.json({ subscription: publicMaintenanceSubscription(subscription) });
  }

  try {
    const recovered = await findMercadoPagoPreapproval({
      accessToken,
      externalReference: subscription.externalReference,
    });
    const plan = subscription.subscriptionSnapshot.plan === 'pro' ? 'pro' : 'starter';
    const provider = recovered ?? await createMercadoPagoPreapproval({
      accessToken,
      subscriptionId: subscription.externalReference,
      plan,
      payerEmail: maintenancePayerEmail(c.env, session.user.email),
      amountCents: subscription.amountCents,
      currency: subscription.currency,
      publicApiUrl: c.env.PUBLIC_API_URL,
      publicWebUrl: c.env.PUBLIC_WEB_URL,
      proposalId: workOrder.id,
      reason: `Mantenimiento LMWares · ${plan === 'pro' ? 'Pro' : 'Starter'} mensual`,
      returnPath: `/suscripcion/${encodeURIComponent(workOrder.id)}`,
      webhookScope: 'maintenance',
    });
    assertPreapprovalMatches(provider, subscription);
    subscription = await saveProvider(c.env, subscription, provider);
  } catch (error) {
    await repos.lmwaresMaintenanceSubscriptions.markCreationFailed(
      subscription.id,
      mercadoPagoProviderDiagnostic(error),
    );
    throw error;
  }
  await audit(c, session.user.id, 'lmwares.maintenance_subscription.create', subscription);
  return c.json({ subscription: publicMaintenanceSubscription(subscription) }, 201);
});

maintenanceSubscriptions.post('/:id/reconcile', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const accessToken = maintenanceAccessToken(c.env);
  let subscription = await ownedSubscription(c.env, c.req.param('id')!, session.user.id);
  const repos = createRepositories(c.env.DB);
  if (!subscription.providerPreapprovalId) {
    const recovered = await findMercadoPagoPreapproval({
      accessToken,
      externalReference: subscription.externalReference,
    });
    if (!recovered) {
      return c.json({ found: false, subscription: publicMaintenanceSubscription(subscription) });
    }
    assertPreapprovalMatches(recovered, subscription);
    subscription = await saveProvider(c.env, subscription, recovered);
  }
  const provider = await getMercadoPagoPreapproval({
    accessToken,
    preapprovalId: subscription.providerPreapprovalId!,
  });
  assertPreapprovalMatches(provider, subscription);
  subscription = await saveProvider(c.env, subscription, provider);
  const charges = await searchMercadoPagoAuthorizedPayments({
    accessToken,
    preapprovalId: provider.id,
  });
  for (const charge of charges) {
    assertChargeMatches(charge, subscription);
    subscription = await repos.lmwaresMaintenanceSubscriptions.reconcileAuthorizedPayment({
      subscriptionId: subscription.id,
      providerAuthorizedPaymentId: charge.id,
      providerPaymentId: charge.paymentId,
      providerStatus: charge.status,
      paymentStatus: charge.paymentStatus,
      summarized: charge.summarized,
      amountCents: Math.round(charge.amount * 100),
      currency: charge.currency,
      debitDate: charge.debitDate,
      retryAttempt: charge.retryAttempt,
    });
  }
  await audit(c, session.user.id, 'lmwares.maintenance_subscription.reconcile', subscription);
  return c.json({ found: true, subscription: publicMaintenanceSubscription(subscription) });
});

maintenanceSubscriptions.post('/:id/cancel', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const accessToken = maintenanceAccessToken(c.env);
  let subscription = await ownedSubscription(c.env, c.req.param('id')!, session.user.id);
  if (!subscription.providerPreapprovalId) {
    throw new AppError('conflict', 'La mensualidad todavía no existe en Mercado Pago.');
  }
  if (subscription.status !== 'canceled') {
    const provider = await cancelMercadoPagoPreapproval({
      accessToken,
      preapprovalId: subscription.providerPreapprovalId,
    });
    assertPreapprovalMatches(provider, subscription);
    subscription = await saveProvider(c.env, subscription, provider);
    await audit(c, session.user.id, 'lmwares.maintenance_subscription.cancel', subscription);
  }
  return c.json({ subscription: publicMaintenanceSubscription(subscription) });
});

async function ownedWorkOrder(env: Bindings, id: string, userId: string) {
  const workOrder = await createRepositories(env.DB).lmwaresStarterWorkOrders.getById(id);
  if (!workOrder || workOrder.userId !== userId) throw AppError.notFound('Orden de trabajo');
  return workOrder;
}

async function ownedSubscription(env: Bindings, id: string, userId: string) {
  const subscription = await createRepositories(env.DB).lmwaresMaintenanceSubscriptions.getById(id);
  if (!subscription || subscription.userId !== userId) {
    throw AppError.notFound('Suscripción de mantenimiento');
  }
  return subscription;
}

async function saveProvider(
  env: Bindings,
  subscription: MaintenanceSubscription,
  provider: MercadoPagoPreapproval,
) {
  return createRepositories(env.DB).lmwaresMaintenanceSubscriptions.savePreapproval({
    id: subscription.id,
    providerPreapprovalId: provider.id,
    authorizationUrl: provider.authorizationUrl,
    providerStatus: provider.status,
    nextPaymentDate: provider.nextPaymentDate,
  });
}

function assertPreapprovalMatches(provider: MercadoPagoPreapproval, subscription: MaintenanceSubscription) {
  if (
    provider.externalReference !== subscription.externalReference ||
    provider.currency !== subscription.currency ||
    Math.round(provider.amount * 100) !== subscription.amountCents ||
    provider.frequency !== subscription.frequency ||
    provider.frequencyType !== subscription.frequencyType
  ) {
    throw new AppError('internal_error', 'La mensualidad no coincide con la oferta comercial congelada.');
  }
}

function assertChargeMatches(
  charge: { preapprovalId: string; externalReference: string; currency: string; amount: number },
  subscription: MaintenanceSubscription,
) {
  if (
    charge.preapprovalId !== subscription.providerPreapprovalId ||
    charge.externalReference !== subscription.externalReference ||
    charge.currency !== subscription.currency ||
    Math.round(charge.amount * 100) !== subscription.amountCents
  ) {
    throw new AppError('internal_error', 'El cargo no coincide con la mensualidad congelada.');
  }
}

function maintenanceAccessToken(env: Bindings): string {
  const token = env.MERCADO_PAGO_MAINTENANCE_ACCESS_TOKEN?.trim();
  if (!token) throw new AppError('internal_error', 'Falta configurar el Access Token de mensualidades.');
  return token;
}

function assertMaintenanceEnabled(env: Bindings): void {
  if (env.MERCADO_PAGO_MAINTENANCE_SUBSCRIPTIONS_ENABLED !== '1') {
    throw new AppError('forbidden', 'La autorización de mensualidades comerciales está cerrada.');
  }
}

function maintenancePayerEmail(env: Bindings, sessionEmail: string): string {
  if (env.MERCADO_PAGO_MAINTENANCE_TEST_MODE !== '1') return sessionEmail;
  const payer = env.MERCADO_PAGO_MAINTENANCE_TEST_PAYER_EMAIL?.trim().toLowerCase();
  if (!payer || !/^[^@\s]+@testuser\.com$/.test(payer)) {
    throw new AppError('internal_error', 'Falta configurar el Buyer TEST de mensualidades.');
  }
  return payer;
}

async function audit(
  c: Parameters<typeof requirePublicSession>[0],
  actorId: string,
  action: string,
  subscription: MaintenanceSubscription,
) {
  await createRepositories(c.env.DB).audit.record({
    actorType: 'public',
    actorId,
    action,
    entityType: 'lmwares_maintenance_subscription',
    entityId: subscription.id,
    metadata: {
      workOrderId: subscription.workOrderId,
      providerPreapprovalId: subscription.providerPreapprovalId,
      status: subscription.status,
      amountCents: subscription.amountCents,
      currency: subscription.currency,
    },
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });
}
