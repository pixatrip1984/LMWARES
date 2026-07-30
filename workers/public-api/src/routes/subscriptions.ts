import { Hono } from 'hono';
import { AppError, type PackageSubscription } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';
import {
  cancelMercadoPagoPreapproval,
  createMercadoPagoPreapproval,
  findMercadoPagoPreapproval,
  getMercadoPagoPreapproval,
  mercadoPagoProviderDiagnostic,
  type MercadoPagoPreapproval,
} from '../lib/mercado-pago';
import { assertTrustedPublicOrigin, requirePublicSession } from '../middleware/public-auth';

const TEST_SUBSCRIPTION_AMOUNT_CENTS = 1000;
const TEST_SUBSCRIPTION_PRICING_VERSION = 'technical-monthly-mxn-10-v1';
// Mercado Pago documents this synthetic payer for pending subscriptions.
// It keeps both collector and payer inside the test environment until the
// buyer selects the real test account in the hosted authorization flow.
const TEST_SUBSCRIPTION_PAYER_EMAIL = 'test_payer@example.com';

export const subscriptions = new Hono<{ Bindings: Bindings; Variables: Variables }>();

subscriptions.get('/proposals/:proposalId', async (c) => {
  const session = await requirePublicSession(c);
  const proposal = await ownedProposal(c.env, c.req.param('proposalId'), session.user.id);
  const subscription = await createRepositories(c.env.DB).lmwaresSubscriptions.getByProposalId(
    proposal.id,
  );
  c.header('Cache-Control', 'no-store');
  return c.json({ subscription: subscription ? publicSubscription(subscription) : null });
});

subscriptions.post('/proposals/:proposalId', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const accessToken = testSubscriptionAccessToken(c.env);
  const proposal = await ownedProposal(c.env, c.req.param('proposalId'), session.user.id);
  if (proposal.status !== 'paid' || proposal.paymentReviewRequired) {
    throw new AppError(
      'conflict',
      'La suscripción requiere una propuesta pagada y sin revisión pendiente.',
    );
  }

  const repos = createRepositories(c.env.DB);
  const claim = await repos.lmwaresSubscriptions.claimCreation({
    proposalId: proposal.id,
    userId: session.user.id,
    amountCents: TEST_SUBSCRIPTION_AMOUNT_CENTS,
    currency: 'MXN',
    pricingVersion: TEST_SUBSCRIPTION_PRICING_VERSION,
  });
  let subscription = claim.subscription;

  if (!claim.claimed) {
    if (!subscription.providerPreapprovalId) {
      throw new AppError(
        'conflict',
        'La suscripción se está preparando. Intenta nuevamente en unos segundos.',
      );
    }
    const providerSubscription = await getMercadoPagoPreapproval({
      accessToken,
      preapprovalId: subscription.providerPreapprovalId,
    });
    assertPreapprovalMatches(providerSubscription, subscription);
    subscription = await saveProviderSubscription(c.env, subscription, providerSubscription);
    return c.json({ subscription: publicSubscription(subscription) });
  }

  try {
    const recovered = await findMercadoPagoPreapproval({
      accessToken,
      externalReference: subscription.externalReference,
    });
    const providerSubscription =
      recovered ??
      (await createMercadoPagoPreapproval({
        accessToken,
        testMode: c.env.MERCADO_PAGO_TEST_MODE === '1',
        subscriptionId: subscription.externalReference,
        plan: proposal.plan,
        payerEmail:
          c.env.MERCADO_PAGO_TEST_MODE === '1'
            ? TEST_SUBSCRIPTION_PAYER_EMAIL
            : session.user.email,
        amountCents: subscription.amountCents,
        currency: subscription.currency,
        publicWebUrl: c.env.PUBLIC_WEB_URL,
        proposalId: proposal.id,
      }));
    assertPreapprovalMatches(providerSubscription, subscription);
    subscription = await saveProviderSubscription(c.env, subscription, providerSubscription);
  } catch (error) {
    await repos.lmwaresSubscriptions.markCreationFailed(
      subscription.id,
      mercadoPagoProviderDiagnostic(error),
    );
    throw error;
  }

  await audit(c, session.user.id, 'lmwares.subscription.create', subscription, {
    proposalId: proposal.id,
    providerPreapprovalId: subscription.providerPreapprovalId,
    amountCents: subscription.amountCents,
    currency: subscription.currency,
    frequency: subscription.frequency,
    frequencyType: subscription.frequencyType,
  });
  return c.json({ subscription: publicSubscription(subscription) }, 201);
});

subscriptions.post('/:id/reconcile', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const accessToken = testSubscriptionAccessToken(c.env);
  let subscription = await ownedSubscription(c.env, c.req.param('id'), session.user.id);
  const providerSubscription = subscription.providerPreapprovalId
    ? await getMercadoPagoPreapproval({
        accessToken,
        preapprovalId: subscription.providerPreapprovalId,
      })
    : await findMercadoPagoPreapproval({
        accessToken,
        externalReference: subscription.externalReference,
      });
  if (!providerSubscription) {
    return c.json({ found: false, subscription: publicSubscription(subscription) });
  }
  assertPreapprovalMatches(providerSubscription, subscription);
  subscription = await saveProviderSubscription(c.env, subscription, providerSubscription);
  await audit(c, session.user.id, 'lmwares.subscription.reconcile', subscription, {
    providerPreapprovalId: providerSubscription.id,
    providerStatus: providerSubscription.status,
    nextPaymentDate: providerSubscription.nextPaymentDate,
  });
  return c.json({ found: true, subscription: publicSubscription(subscription) });
});

subscriptions.post('/:id/cancel', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  const accessToken = testSubscriptionAccessToken(c.env);
  let subscription = await ownedSubscription(c.env, c.req.param('id'), session.user.id);
  if (!subscription.providerPreapprovalId) {
    throw new AppError('conflict', 'La suscripción todavía no existe en Mercado Pago.');
  }
  if (subscription.status === 'canceled') {
    return c.json({ subscription: publicSubscription(subscription) });
  }
  const providerSubscription = await cancelMercadoPagoPreapproval({
    accessToken,
    preapprovalId: subscription.providerPreapprovalId,
  });
  assertPreapprovalMatches(providerSubscription, subscription);
  subscription = await saveProviderSubscription(c.env, subscription, providerSubscription);
  await audit(c, session.user.id, 'lmwares.subscription.cancel', subscription, {
    providerPreapprovalId: subscription.providerPreapprovalId,
    providerStatus: subscription.providerStatus,
  });
  return c.json({ subscription: publicSubscription(subscription) });
});

async function saveProviderSubscription(
  env: Bindings,
  subscription: PackageSubscription,
  providerSubscription: MercadoPagoPreapproval,
): Promise<PackageSubscription> {
  return createRepositories(env.DB).lmwaresSubscriptions.savePreapproval({
    id: subscription.id,
    providerPreapprovalId: providerSubscription.id,
    authorizationUrl: providerSubscription.authorizationUrl,
    providerStatus: providerSubscription.status,
    nextPaymentDate: providerSubscription.nextPaymentDate,
  });
}

function assertPreapprovalMatches(
  provider: MercadoPagoPreapproval,
  subscription: PackageSubscription,
): void {
  if (
    provider.externalReference !== subscription.externalReference ||
    provider.currency !== subscription.currency ||
    Math.round(provider.amount * 100) !== subscription.amountCents ||
    provider.frequency !== subscription.frequency ||
    provider.frequencyType !== subscription.frequencyType
  ) {
    console.error(
      JSON.stringify({
        message: 'mercado_pago_subscription_mismatch',
        subscriptionId: subscription.id,
        externalReferenceMatches: provider.externalReference === subscription.externalReference,
        currencyMatches: provider.currency === subscription.currency,
        amountMatches: Math.round(provider.amount * 100) === subscription.amountCents,
        frequencyMatches:
          provider.frequency === subscription.frequency &&
          provider.frequencyType === subscription.frequencyType,
      }),
    );
    throw new AppError(
      'internal_error',
      'La suscripción encontrada no coincide con la configuración congelada.',
    );
  }
}

async function ownedProposal(env: Bindings, id: string, userId: string) {
  const proposal = await createRepositories(env.DB).lmwaresPayments.getById(id);
  if (!proposal || proposal.userId !== userId) throw AppError.notFound('Propuesta');
  return proposal;
}

async function ownedSubscription(
  env: Bindings,
  id: string,
  userId: string,
): Promise<PackageSubscription> {
  const subscription = await createRepositories(env.DB).lmwaresSubscriptions.getById(id);
  if (!subscription || subscription.userId !== userId) throw AppError.notFound('Suscripción');
  return subscription;
}

function testSubscriptionAccessToken(env: Bindings): string {
  if (env.MERCADO_PAGO_TEST_MODE !== '1') {
    throw new AppError('forbidden', 'La suscripción técnica de MXN $10 no está habilitada.');
  }
  const accessToken = env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    throw new AppError(
      'internal_error',
      'Falta configurar el Access Token de la aplicación de Suscripciones.',
    );
  }
  return accessToken;
}

function publicSubscription(subscription: PackageSubscription) {
  return {
    id: subscription.id,
    proposalId: subscription.proposalId,
    status: subscription.status,
    amountCents: subscription.amountCents,
    currency: subscription.currency,
    frequency: subscription.frequency,
    frequencyType: subscription.frequencyType,
    pricingVersion: subscription.pricingVersion,
    authorizationUrl: subscription.authorizationUrl,
    providerStatus: subscription.providerStatus,
    nextPaymentDate: subscription.nextPaymentDate,
    lastAuthorizedPaymentId: subscription.lastAuthorizedPaymentId,
    lastAuthorizedPaymentStatus: subscription.lastAuthorizedPaymentStatus,
    authorizedAt: subscription.authorizedAt,
    canceledAt: subscription.canceledAt,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

async function audit(
  c: Parameters<typeof requirePublicSession>[0],
  actorId: string,
  action: string,
  subscription: PackageSubscription,
  metadata: Record<string, unknown>,
): Promise<void> {
  await createRepositories(c.env.DB).audit.record({
    actorType: 'public',
    actorId,
    action,
    entityType: 'lmwares_subscription',
    entityId: subscription.id,
    metadata,
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });
}
