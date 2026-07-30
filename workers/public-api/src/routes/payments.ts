import { Hono } from 'hono';
import {
  AppError,
  checkoutBlocked,
  type PackageProposal,
  type PackageSubscription,
  type PaidPackageModuleId,
} from '@starter/domain';
import { createRepositories } from '@starter/db';
import { createTestPackageProposalSchema, parseInput } from '@starter/validation';
import type { Bindings, Variables } from '../env';
import {
  createMercadoPagoPreference,
  expireMercadoPagoPreference,
  getMercadoPagoAuthorizedPayment,
  getMercadoPagoPayment,
  getMercadoPagoPreapproval,
  hasMercadoPagoWebhookSignatureFormat,
  searchMercadoPagoPayments,
  type MercadoPagoAuthorizedPayment,
  type MercadoPagoPreapproval,
  verifyMercadoPagoWebhookSignature,
} from '../lib/mercado-pago';
import { assertTrustedPublicOrigin, requirePublicSession } from '../middleware/public-auth';

const TEST_AMOUNT_CENTS = 500;
const TEST_PRICING_VERSION = 'technical-mxn-5-v1';

export const payments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

payments.post('/webhooks/mercado-pago', async (c) => {
  const webhookTopic = c.req.query('type') ?? '';
  const ipnTopic = c.req.query('topic') ?? '';
  const topic = webhookTopic || ipnTopic;
  const webhookSecrets = mercadoPagoWebhookSecrets(
    c.env,
    topic === 'subscription_preapproval' || topic === 'subscription_authorized_payment'
      ? 'subscriptions'
      : 'checkout',
  );
  if (topic === 'subscription_preapproval') {
    return handleSubscriptionPreapprovalWebhook(c, webhookSecrets);
  }
  if (topic === 'subscription_authorized_payment') {
    return handleSubscriptionAuthorizedPaymentWebhook(c, webhookSecrets);
  }
  if (topic !== 'payment') {
    return c.json({ received: true, ignored: true });
  }

  const signedDataId = c.req.query('data.id') ?? '';
  const legacyPaymentId = c.req.query('id') ?? '';
  const paymentId = signedDataId || legacyPaymentId;
  const isLegacyIpn = ipnTopic === 'payment' && Boolean(legacyPaymentId) && !signedDataId;
  const requestId = c.req.header('x-request-id') ?? '';
  const signature = c.req.header('x-signature') ?? '';
  if (!/^\d{1,32}$/.test(paymentId)) {
    throw new AppError('unauthorized', 'Notificación de Mercado Pago inválida.');
  }
  if (!isLegacyIpn && (!requestId || requestId.length > 200 || !signature)) {
    throw new AppError('unauthorized', 'Notificación de Mercado Pago inválida.');
  }

  let signatureValidated = false;
  let providerVerifiedTestWebhook = false;
  if (!isLegacyIpn) {
    if (!hasMercadoPagoWebhookSignatureFormat(signature)) {
      throw new AppError('unauthorized', 'Firma de Mercado Pago inválida.');
    }
    const signatureChecks = await Promise.all(
      webhookSecrets.map((secret) =>
        verifyMercadoPagoWebhookSignature({
          xSignature: signature,
          xRequestId: requestId,
          dataId: signedDataId,
          secret,
        }),
      ),
    );
    signatureValidated = signatureChecks.some(Boolean);
    if (!signatureValidated && c.env.MERCADO_PAGO_TEST_MODE !== '1') {
      throw new AppError('unauthorized', 'Firma de Mercado Pago inválida.');
    }
    if (!signatureValidated) {
      providerVerifiedTestWebhook = true;
      console.warn(
        JSON.stringify({
          message: 'mercado_pago_test_webhook_provider_verification_required',
          paymentId,
          requestId,
        }),
      );
    }
  }

  // Mercado Pago IPN is a legacy transport. Its x-signature cannot be
  // validated with the Webhooks secret, so the notification only supplies an
  // identifier: the payment is always fetched from Mercado Pago and checked
  // against our proposal before any state is changed.
  const providerVerifiedPayment =
    isLegacyIpn || providerVerifiedTestWebhook
      ? await getMercadoPagoPayment({
          accessToken: c.env.MERCADO_PAGO_ACCESS_TOKEN,
          paymentId,
        })
      : null;
  const providerRequestId = isLegacyIpn
    ? `ipn:payment:${paymentId}:${providerVerifiedPayment?.status ?? 'unknown'}`
    : providerVerifiedTestWebhook
      ? `test-webhook:payment:${paymentId}:${providerVerifiedPayment?.status ?? 'unknown'}`
      : requestId;
  const transport = isLegacyIpn
    ? 'ipn'
    : providerVerifiedTestWebhook
      ? 'webhook_test_provider_verified'
      : 'webhook';

  const repos = createRepositories(c.env.DB);
  const eventId = await repos.lmwaresPayments.claimWebhookEvent({
    providerRequestId,
    topic: isLegacyIpn
      ? 'payment_ipn'
      : providerVerifiedTestWebhook
        ? 'payment_test_provider_verified'
        : topic,
    resourceId: paymentId,
  });
  if (!eventId) {
    return c.json({ received: true, duplicate: true });
  }

  try {
    const payment =
      providerVerifiedPayment ??
      (await getMercadoPagoPayment({
        accessToken: c.env.MERCADO_PAGO_ACCESS_TOKEN,
        paymentId,
      }));
    const proposal = await repos.lmwaresPayments.getById(payment.externalReference);
    if (!proposal) {
      const subscription = await repos.lmwaresSubscriptions.getByExternalReference(
        payment.externalReference,
      );
      if (subscription) {
        assertPaymentMatchesSubscription(payment, subscription);
        await repos.lmwaresPayments.completeWebhookEvent({
          id: eventId,
          status: 'processed',
          proposalId: null,
          subscriptionId: subscription.id,
        });
        await repos.audit.record({
          actorType: 'system',
          actorId: 'mercado_pago',
          action: 'lmwares.subscription.payment_observed',
          entityType: 'lmwares_subscription',
          entityId: subscription.id,
          metadata: {
            providerPaymentId: payment.id,
            providerStatus: payment.status,
            providerRequestId,
            transport,
            signatureValidated,
          },
          ip: c.req.header('CF-Connecting-IP') ?? null,
          userAgent: c.req.header('User-Agent') ?? null,
        });
        return c.json({ received: true, subscriptionPayment: true });
      }
      await repos.lmwaresPayments.completeWebhookEvent({
        id: eventId,
        status: 'ignored',
        proposalId: null,
      });
      return c.json({ received: true, ignored: true });
    }

    assertPaymentMatchesProposal(payment, proposal);
    const reconciliation = await repos.lmwaresPayments.reconcilePayment({
      id: proposal.id,
      paymentId: payment.id,
      providerStatus: payment.status,
      amountCents: Math.round(payment.amount * 100),
      currency: payment.currency,
      providerCreatedAt: payment.dateCreated,
    });
    const preferenceExpired = await tryExpirePaidPreference(c.env, reconciliation.proposal);
    await repos.lmwaresPayments.completeWebhookEvent({
      id: eventId,
      status: 'processed',
      proposalId: proposal.id,
    });
    await repos.audit.record({
      actorType: 'system',
      actorId: 'mercado_pago',
      action: reconciliation.duplicatePayment
        ? 'lmwares.package_proposal.duplicate_payment_detected'
        : isLegacyIpn
          ? 'lmwares.package_proposal.ipn_reconciled'
          : 'lmwares.package_proposal.webhook_reconciled',
      entityType: 'lmwares_package_proposal',
      entityId: proposal.id,
      metadata: {
        providerPaymentId: payment.id,
        providerStatus: payment.status,
        proposalStatus: reconciliation.proposal.status,
        disposition: reconciliation.disposition,
        duplicatePayment: reconciliation.duplicatePayment,
        providerRequestId,
        transport,
        signatureValidated,
        preferenceExpired,
      },
      ip: c.req.header('CF-Connecting-IP') ?? null,
      userAgent: c.req.header('User-Agent') ?? null,
    });
    return c.json({
      received: true,
      duplicatePayment: reconciliation.duplicatePayment,
    });
  } catch (error) {
    await repos.lmwaresPayments.failWebhookEvent(
      eventId,
      error instanceof AppError ? error.code : 'internal_error',
    );
    throw error;
  }
});

async function handleSubscriptionPreapprovalWebhook(
  c: Parameters<typeof requirePublicSession>[0],
  webhookSecrets: string[],
) {
  const resourceId = c.req.query('data.id') ?? '';
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(resourceId)) {
    throw new AppError('unauthorized', 'Notificación de Mercado Pago inválida.');
  }
  const signature = await validateSignedWebhook(c, webhookSecrets, resourceId);
  const provider = await getMercadoPagoPreapproval({
    accessToken: mercadoPagoSubscriptionsAccessToken(c.env),
    preapprovalId: resourceId,
  });
  const repos = createRepositories(c.env.DB);
  const providerRequestId = signature.validated
    ? signature.requestId
    : `test-webhook:subscription_preapproval:${resourceId}:${provider.status}`;
  const eventId = await repos.lmwaresPayments.claimWebhookEvent({
    providerRequestId,
    topic: signature.validated
      ? 'subscription_preapproval'
      : 'subscription_preapproval_test_provider_verified',
    resourceId,
  });
  if (!eventId) return c.json({ received: true, duplicate: true });

  try {
    const subscription =
      (await repos.lmwaresSubscriptions.getByProviderPreapprovalId(provider.id)) ??
      (await repos.lmwaresSubscriptions.getByExternalReference(provider.externalReference));
    if (!subscription) {
      await repos.lmwaresPayments.completeWebhookEvent({
        id: eventId,
        status: 'ignored',
        proposalId: null,
      });
      return c.json({ received: true, ignored: true });
    }
    assertPreapprovalMatchesSubscription(provider, subscription);
    const reconciled = await repos.lmwaresSubscriptions.savePreapproval({
      id: subscription.id,
      providerPreapprovalId: provider.id,
      authorizationUrl: provider.authorizationUrl,
      providerStatus: provider.status,
      nextPaymentDate: provider.nextPaymentDate,
    });
    await repos.lmwaresPayments.completeWebhookEvent({
      id: eventId,
      status: 'processed',
      proposalId: null,
      subscriptionId: subscription.id,
    });
    await repos.audit.record({
      actorType: 'system',
      actorId: 'mercado_pago',
      action: 'lmwares.subscription.preapproval_reconciled',
      entityType: 'lmwares_subscription',
      entityId: subscription.id,
      metadata: {
        providerPreapprovalId: provider.id,
        providerStatus: provider.status,
        subscriptionStatus: reconciled.status,
        nextPaymentDate: provider.nextPaymentDate,
        providerRequestId,
        signatureValidated: signature.validated,
      },
      ip: c.req.header('CF-Connecting-IP') ?? null,
      userAgent: c.req.header('User-Agent') ?? null,
    });
    return c.json({ received: true });
  } catch (error) {
    await repos.lmwaresPayments.failWebhookEvent(
      eventId,
      error instanceof AppError ? error.code : 'internal_error',
    );
    throw error;
  }
}

async function handleSubscriptionAuthorizedPaymentWebhook(
  c: Parameters<typeof requirePublicSession>[0],
  webhookSecrets: string[],
) {
  const resourceId = c.req.query('data.id') ?? '';
  if (!/^\d{1,32}$/.test(resourceId)) {
    // Mercado Pago's dashboard simulator currently sends an alphanumeric
    // placeholder and the subscription_authorized_payment topic in the URL,
    // even when its sample body describes a preapproval. It also signs the
    // body's data.id instead of the URL placeholder. In test mode we may
    // acknowledge that connectivity probe, but only after its HMAC validates.
    // It must never be fetched or persisted as a real billing event.
    if (
      c.env.MERCADO_PAGO_TEST_MODE === '1' &&
      /^[a-zA-Z0-9_-]{1,160}$/.test(resourceId)
    ) {
      const probeDataId = await readMercadoPagoSubscriptionProbeDataId(c);
      if (probeDataId) {
        const probeSignature = await validateSignedWebhook(c, webhookSecrets, probeDataId);
        if (probeSignature.validated) {
          console.info(
            JSON.stringify({
              message: 'mercado_pago_subscription_webhook_test_probe_received',
              topic: 'subscription_authorized_payment',
              requestId: probeSignature.requestId,
            }),
          );
          return c.json({ received: true, testProbe: true });
        }
      }
    }
    throw new AppError('unauthorized', 'Notificación de Mercado Pago inválida.');
  }
  const signature = await validateSignedWebhook(c, webhookSecrets, resourceId);
  const provider = await getMercadoPagoAuthorizedPayment({
    accessToken: mercadoPagoSubscriptionsAccessToken(c.env),
    authorizedPaymentId: resourceId,
  });
  const repos = createRepositories(c.env.DB);
  const providerRequestId = signature.validated
    ? signature.requestId
    : `test-webhook:subscription_authorized_payment:${resourceId}:${provider.status}:${provider.paymentStatus ?? 'none'}`;
  const eventId = await repos.lmwaresPayments.claimWebhookEvent({
    providerRequestId,
    topic: signature.validated
      ? 'subscription_authorized_payment'
      : 'subscription_authorized_payment_test_provider_verified',
    resourceId,
  });
  if (!eventId) return c.json({ received: true, duplicate: true });

  try {
    const subscription =
      (await repos.lmwaresSubscriptions.getByProviderPreapprovalId(provider.preapprovalId)) ??
      (await repos.lmwaresSubscriptions.getByExternalReference(provider.externalReference));
    if (!subscription) {
      await repos.lmwaresPayments.completeWebhookEvent({
        id: eventId,
        status: 'ignored',
        proposalId: null,
      });
      return c.json({ received: true, ignored: true });
    }
    assertAuthorizedPaymentMatchesSubscription(provider, subscription);
    const reconciled = await repos.lmwaresSubscriptions.reconcileAuthorizedPayment({
      subscriptionId: subscription.id,
      providerAuthorizedPaymentId: provider.id,
      providerPaymentId: provider.paymentId,
      providerStatus: provider.status,
      paymentStatus: provider.paymentStatus,
      summarized: provider.summarized,
      amountCents: Math.round(provider.amount * 100),
      currency: provider.currency,
      debitDate: provider.debitDate,
      retryAttempt: provider.retryAttempt,
    });
    await repos.lmwaresPayments.completeWebhookEvent({
      id: eventId,
      status: 'processed',
      proposalId: null,
      subscriptionId: subscription.id,
    });
    await repos.audit.record({
      actorType: 'system',
      actorId: 'mercado_pago',
      action: 'lmwares.subscription.authorized_payment_reconciled',
      entityType: 'lmwares_subscription',
      entityId: subscription.id,
      metadata: {
        providerAuthorizedPaymentId: provider.id,
        providerPaymentId: provider.paymentId,
        providerStatus: provider.status,
        paymentStatus: provider.paymentStatus,
        subscriptionStatus: reconciled.status,
        providerRequestId,
        signatureValidated: signature.validated,
      },
      ip: c.req.header('CF-Connecting-IP') ?? null,
      userAgent: c.req.header('User-Agent') ?? null,
    });
    return c.json({ received: true });
  } catch (error) {
    await repos.lmwaresPayments.failWebhookEvent(
      eventId,
      error instanceof AppError ? error.code : 'internal_error',
    );
    throw error;
  }
}

async function readMercadoPagoSubscriptionProbeDataId(
  c: Parameters<typeof requirePublicSession>[0],
): Promise<string | null> {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return null;
  }
  if (
    !isWebhookRecord(payload) ||
    payload.type !== 'subscription_preapproval' ||
    payload.entity !== 'preapproval' ||
    !isWebhookRecord(payload.data) ||
    typeof payload.data.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,160}$/.test(payload.data.id)
  ) {
    return null;
  }
  return payload.data.id;
}

function isWebhookRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function validateSignedWebhook(
  c: Parameters<typeof requirePublicSession>[0],
  webhookSecrets: string[],
  dataId: string,
): Promise<{ requestId: string; validated: boolean }> {
  const requestId = c.req.header('x-request-id') ?? '';
  const signature = c.req.header('x-signature') ?? '';
  if (!requestId || requestId.length > 200 || !hasMercadoPagoWebhookSignatureFormat(signature)) {
    throw new AppError('unauthorized', 'Notificación de Mercado Pago inválida.');
  }
  const checks = await Promise.all(
    webhookSecrets.map((secret) =>
      verifyMercadoPagoWebhookSignature({
        xSignature: signature,
        xRequestId: requestId,
        dataId,
        secret,
      }),
    ),
  );
  const validated = checks.some(Boolean);
  if (!validated && c.env.MERCADO_PAGO_TEST_MODE !== '1') {
    throw new AppError('unauthorized', 'Firma de Mercado Pago inválida.');
  }
  if (!validated) {
    console.warn(
      JSON.stringify({
        message: 'mercado_pago_test_webhook_provider_verification_required',
        dataId,
        requestId,
      }),
    );
  }
  return { requestId, validated };
}

payments.post('/proposals', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  assertTestPaymentConfiguration(c.env);
  const input = parseInput(createTestPackageProposalSchema, await readJson(c));
  const modules = normalizeAndValidateModules(input.plan, input.modules);
  const repos = createRepositories(c.env.DB);

  const proposal = await repos.lmwaresPayments.create({
    userId: session.user.id,
    plan: input.plan,
    modules,
    marketing: input.marketing,
    amountCents: TEST_AMOUNT_CENTS,
    currency: 'MXN',
    pricingVersion: TEST_PRICING_VERSION,
    packageSnapshot: {
      schema: 'lmwares.package-proposal.v1',
      plan: input.plan,
      modules,
      marketing: input.marketing,
      purpose: 'checkout-pro-technical-validation',
    },
  });
  await audit(c, session.user.id, 'lmwares.package_proposal.create', proposal, {
    amountCents: proposal.amountCents,
    currency: proposal.currency,
  });
  return c.json({ proposal: publicProposal(proposal) }, 201);
});

payments.get('/proposals/:id', async (c) => {
  const session = await requirePublicSession(c);
  const proposal = await ownedProposal(c.env, c.req.param('id'), session.user.id);
  c.header('Cache-Control', 'no-store');
  return c.json({ proposal: publicProposal(proposal) });
});

payments.post('/proposals/:id/checkout', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  assertTestPaymentConfiguration(c.env);
  const repos = createRepositories(c.env.DB);
  let proposal = await ownedProposal(c.env, c.req.param('id'), session.user.id);

  if (checkoutBlocked(proposal)) {
    throw new AppError('conflict', 'Esta propuesta ya no admite otro pago.');
  }
  if (proposal.checkoutUrl && proposal.providerPreferenceId) {
    if (checkoutExpired(proposal)) {
      throw new AppError(
        'conflict',
        'Este checkout venció. Vuelve al configurador para generar una propuesta nueva.',
      );
    }
    return c.json({ proposal: publicProposal(proposal) });
  }

  const claimed = await repos.lmwaresPayments.claimCheckout(proposal.id);
  if (!claimed) {
    proposal = (await repos.lmwaresPayments.getById(proposal.id))!;
    if (checkoutBlocked(proposal)) {
      throw new AppError('conflict', 'Esta propuesta ya no admite otro pago.');
    }
    if (proposal.checkoutUrl && !checkoutExpired(proposal)) {
      return c.json({ proposal: publicProposal(proposal) });
    }
    throw new AppError(
      'conflict',
      'El checkout se está preparando. Intenta nuevamente en unos segundos.',
    );
  }

  try {
    const preference = await createMercadoPagoPreference({
      accessToken: c.env.MERCADO_PAGO_ACCESS_TOKEN,
      proposal,
      payerEmail: session.user.email,
      testMode: true,
      publicApiUrl: c.env.PUBLIC_API_URL,
      publicWebUrl: c.env.PUBLIC_WEB_URL,
    });
    proposal = await repos.lmwaresPayments.saveCheckout({
      id: proposal.id,
      preferenceId: preference.id,
      checkoutUrl: preference.checkoutUrl,
      checkoutExpiresAt: preference.expiresAt,
    });
  } catch (error) {
    await repos.lmwaresPayments.markCheckoutFailed(proposal.id);
    throw error;
  }

  await audit(c, session.user.id, 'lmwares.package_proposal.checkout_created', proposal, {
    providerPreferenceId: proposal.providerPreferenceId,
  });
  return c.json({ proposal: publicProposal(proposal) });
});

payments.post('/proposals/:id/reconcile', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  assertTestPaymentConfiguration(c.env);
  const repos = createRepositories(c.env.DB);
  let proposal = await ownedProposal(c.env, c.req.param('id'), session.user.id);
  if (!proposal.providerPreferenceId) {
    throw new AppError('conflict', 'Primero debes preparar el checkout.');
  }

  const paymentsFound = await searchMercadoPagoPayments({
    accessToken: c.env.MERCADO_PAGO_ACCESS_TOKEN,
    externalReference: proposal.id,
  });
  if (paymentsFound.length === 0) {
    return c.json({ found: false, proposal: publicProposal(proposal) });
  }

  const orderedPayments = [...paymentsFound].sort(
    (left, right) => paymentTimestamp(left.dateCreated) - paymentTimestamp(right.dateCreated),
  );
  let duplicatePayments = 0;
  for (const payment of orderedPayments) {
    assertPaymentMatchesProposal(payment, proposal);
    const reconciliation = await repos.lmwaresPayments.reconcilePayment({
      id: proposal.id,
      paymentId: payment.id,
      providerStatus: payment.status,
      amountCents: Math.round(payment.amount * 100),
      currency: payment.currency,
      providerCreatedAt: payment.dateCreated,
    });
    proposal = reconciliation.proposal;
    if (reconciliation.duplicatePayment) duplicatePayments += 1;
  }
  const preferenceExpired = await tryExpirePaidPreference(c.env, proposal);
  await audit(c, session.user.id, 'lmwares.package_proposal.reconciled', proposal, {
    providerPaymentId: proposal.providerPaymentId,
    providerStatus: proposal.lastProviderStatus,
    paymentsFound: orderedPayments.length,
    duplicatePayments,
    preferenceExpired,
  });
  return c.json({ found: true, proposal: publicProposal(proposal) });
});

function checkoutExpired(proposal: PackageProposal): boolean {
  if (!proposal.checkoutExpiresAt) return false;
  const expiresAt = Date.parse(proposal.checkoutExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function paymentTimestamp(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

async function tryExpirePaidPreference(env: Bindings, proposal: PackageProposal): Promise<boolean> {
  if (proposal.status !== 'paid' || !proposal.providerPreferenceId) return false;
  if (checkoutExpired(proposal)) return true;
  try {
    const expiresAt = await expireMercadoPagoPreference({
      accessToken: env.MERCADO_PAGO_ACCESS_TOKEN,
      preferenceId: proposal.providerPreferenceId,
      validFrom: proposal.createdAt,
    });
    await createRepositories(env.DB).lmwaresPayments.markCheckoutExpired({
      id: proposal.id,
      preferenceId: proposal.providerPreferenceId,
      expiresAt,
    });
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'mercado_pago_preference_expiration_failed',
        proposalId: proposal.id,
        providerPreferenceId: proposal.providerPreferenceId,
        errorCode: error instanceof AppError ? error.code : 'internal_error',
      }),
    );
    return false;
  }
}

function normalizeAndValidateModules(
  plan: 'starter' | 'pro',
  input: PaidPackageModuleId[],
): PaidPackageModuleId[] {
  const modules = [...new Set(input)];
  if (!modules.includes('landing') || !modules.includes('panel')) {
    throw new AppError(
      'validation_error',
      'Landing y Panel son obligatorios en los paquetes pagados.',
    );
  }
  if (plan === 'starter') {
    if (modules.includes('cart') || modules.includes('data')) {
      throw new AppError('validation_error', 'Carrito y Optimization requieren el plan Pro.');
    }
    const complements = modules.filter((module) => module !== 'landing' && module !== 'panel');
    if (complements.length > 2) {
      throw new AppError('validation_error', 'Starter permite hasta dos complementos.');
    }
  }
  return modules;
}

function assertPaymentMatchesProposal(
  payment: {
    externalReference: string;
    currency: string;
    amount: number;
  },
  proposal: PackageProposal,
): void {
  const amountCents = Math.round(payment.amount * 100);
  if (
    payment.externalReference !== proposal.id ||
    payment.currency !== proposal.currency ||
    amountCents !== proposal.amountCents
  ) {
    console.error(
      JSON.stringify({
        message: 'mercado_pago_reconciliation_mismatch',
        proposalId: proposal.id,
        externalReferenceMatches: payment.externalReference === proposal.id,
        currencyMatches: payment.currency === proposal.currency,
        amountMatches: amountCents === proposal.amountCents,
      }),
    );
    throw new AppError(
      'internal_error',
      'El pago encontrado no coincide con la propuesta congelada.',
    );
  }
}

function assertPaymentMatchesSubscription(
  payment: {
    externalReference: string;
    currency: string;
    amount: number;
  },
  subscription: PackageSubscription,
): void {
  if (
    payment.externalReference !== subscription.externalReference ||
    payment.currency !== subscription.currency ||
    Math.round(payment.amount * 100) !== subscription.amountCents
  ) {
    throw new AppError(
      'internal_error',
      'El pago recurrente no coincide con la suscripción congelada.',
    );
  }
}

function assertPreapprovalMatchesSubscription(
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
    throw new AppError(
      'internal_error',
      'La suscripción notificada no coincide con la configuración congelada.',
    );
  }
}

function assertAuthorizedPaymentMatchesSubscription(
  provider: MercadoPagoAuthorizedPayment,
  subscription: PackageSubscription,
): void {
  if (
    provider.preapprovalId !== subscription.providerPreapprovalId ||
    provider.externalReference !== subscription.externalReference ||
    provider.currency !== subscription.currency ||
    Math.round(provider.amount * 100) !== subscription.amountCents
  ) {
    throw new AppError(
      'internal_error',
      'El cargo programado no coincide con la suscripción congelada.',
    );
  }
}

async function ownedProposal(env: Bindings, id: string, userId: string): Promise<PackageProposal> {
  const proposal = await createRepositories(env.DB).lmwaresPayments.getById(id);
  if (!proposal || proposal.userId !== userId) throw AppError.notFound('Propuesta');
  return proposal;
}

function assertTestPaymentConfiguration(env: Bindings): void {
  if (env.MERCADO_PAGO_TEST_MODE !== '1') {
    throw new AppError('forbidden', 'El checkout técnico de MXN $5 no está habilitado.');
  }
  if (!env.MERCADO_PAGO_ACCESS_TOKEN?.trim()) {
    throw new AppError(
      'internal_error',
      'Falta configurar el Access Token de prueba de Mercado Pago.',
    );
  }
}

function mercadoPagoSubscriptionsAccessToken(env: Bindings): string {
  const accessToken = env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    throw new AppError(
      'internal_error',
      'Falta configurar el Access Token de la aplicación de Suscripciones.',
    );
  }
  return accessToken;
}

function mercadoPagoWebhookSecrets(
  env: Bindings,
  application: 'checkout' | 'subscriptions',
): string[] {
  if (application === 'subscriptions') {
    mercadoPagoSubscriptionsAccessToken(env);
  } else if (!env.MERCADO_PAGO_ACCESS_TOKEN?.trim()) {
    throw new AppError('internal_error', 'Falta configurar el Access Token de Checkout Pro.');
  }
  const productionSecret =
    application === 'subscriptions'
      ? env.MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_SECRET?.trim()
      : env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
  const testSecret =
    env.MERCADO_PAGO_TEST_MODE === '1'
      ? application === 'subscriptions'
        ? env.MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_TEST_SECRET?.trim()
        : env.MERCADO_PAGO_WEBHOOK_TEST_SECRET?.trim()
      : undefined;
  const secrets = [...new Set([productionSecret, testSecret].filter(Boolean) as string[])];
  if (secrets.length > 0) return secrets;
  if (env.MERCADO_PAGO_TEST_MODE !== '1') {
    throw new AppError('internal_error', 'Falta configurar la firma secreta de Webhooks.');
  }
  return [];
}

function publicProposal(proposal: PackageProposal) {
  return {
    id: proposal.id,
    plan: proposal.plan,
    modules: proposal.modules,
    marketing: proposal.marketing,
    status: proposal.status,
    amountCents: proposal.amountCents,
    currency: proposal.currency,
    pricingVersion: proposal.pricingVersion,
    checkoutUrl: proposal.checkoutUrl,
    checkoutExpiresAt: proposal.checkoutExpiresAt,
    lastProviderStatus: proposal.lastProviderStatus,
    paymentReviewRequired: proposal.paymentReviewRequired,
    paidAt: proposal.paidAt,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}

async function audit(
  c: Parameters<typeof requirePublicSession>[0],
  actorId: string,
  action: string,
  proposal: PackageProposal,
  metadata: Record<string, unknown>,
): Promise<void> {
  await createRepositories(c.env.DB).audit.record({
    actorType: 'public',
    actorId,
    action,
    entityType: 'lmwares_package_proposal',
    entityId: proposal.id,
    metadata,
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });
}

async function readJson(c: Parameters<typeof requirePublicSession>[0]): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError('validation_error', 'El cuerpo JSON es inválido.');
  }
}
