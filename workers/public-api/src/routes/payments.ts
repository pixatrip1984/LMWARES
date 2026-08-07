import { Hono } from 'hono';
import {
  AppError,
  checkoutBlocked,
  normalizePaidPackageModules,
  type BillingOrder,
  type MaintenanceSubscription,
  type PackageProposal,
  type PackageSubscription,
} from '@starter/domain';
import { createRepositories } from '@starter/db';
import { createTestPackageProposalSchema, parseInput } from '@starter/validation';
import type { Bindings, Variables } from '../env';
import {
  createMercadoPagoPreference,
  createMercadoPagoBillingPreference,
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
import { publicBillingOrder } from '../lib/billing-order-public';

const TEST_AMOUNT_CENTS = 500;
const TEST_PRICING_VERSION = 'technical-mxn-5-v1';

export const payments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

payments.post('/webhooks/mercado-pago', async (c) => {
  const commercialScope = c.req.query('scope') === 'commercial';
  const maintenanceScope = c.req.query('scope') === 'maintenance';
  const webhookTopic = c.req.query('type') ?? '';
  const ipnTopic = c.req.query('topic') ?? '';
  const topic = webhookTopic || ipnTopic;
  const webhookSecrets = mercadoPagoWebhookSecrets(
    c.env,
    commercialScope
      ? 'commercial'
      : maintenanceScope
      ? 'maintenance'
      : topic === 'subscription_preapproval' || topic === 'subscription_authorized_payment'
      ? 'subscriptions'
      : 'checkout',
  );
  const webhookTestMode = commercialScope
    ? c.env.MERCADO_PAGO_COMMERCIAL_TEST_MODE === '1'
    : maintenanceScope
    ? c.env.MERCADO_PAGO_MAINTENANCE_TEST_MODE === '1'
    : c.env.MERCADO_PAGO_TEST_MODE === '1';
  if (topic === 'subscription_preapproval') {
    return handleSubscriptionPreapprovalWebhook(c, webhookSecrets, maintenanceScope, webhookTestMode);
  }
  if (topic === 'subscription_authorized_payment') {
    return handleSubscriptionAuthorizedPaymentWebhook(c, webhookSecrets, maintenanceScope, webhookTestMode);
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
    if (!signatureValidated && !webhookTestMode) {
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
          accessToken: commercialScope
            ? mercadoPagoCommercialAccessToken(c.env)
            : maintenanceScope
            ? mercadoPagoMaintenanceAccessToken(c.env)
            : c.env.MERCADO_PAGO_ACCESS_TOKEN,
          paymentId,
        })
      : null;
  const maintenanceEventPrefix = maintenanceScope ? 'maintenance:' : '';
  const providerRequestId = isLegacyIpn
    ? `${maintenanceEventPrefix}ipn:payment:${paymentId}:${providerVerifiedPayment?.status ?? 'unknown'}`
    : providerVerifiedTestWebhook
      ? `${maintenanceEventPrefix}test-webhook:payment:${paymentId}:${providerVerifiedPayment?.status ?? 'unknown'}`
      : `${maintenanceEventPrefix}${requestId}`;
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
        accessToken: commercialScope
          ? mercadoPagoCommercialAccessToken(c.env)
          : maintenanceScope
          ? mercadoPagoMaintenanceAccessToken(c.env)
          : c.env.MERCADO_PAGO_ACCESS_TOKEN,
        paymentId,
      }));
    if (payment.externalReference.startsWith('lmw-implementation:')) {
      if (!commercialScope) {
        throw new AppError('unauthorized', 'El pago comercial llegó por un canal incorrecto.');
      }
      const order = await repos.lmwaresBillingOrders.getByExternalReference(payment.externalReference);
      if (!order) {
        await repos.lmwaresPayments.completeWebhookEvent({
          id: eventId,
          status: 'ignored',
          proposalId: null,
        });
        return c.json({ received: true, ignored: true });
      }
      assertPaymentMatchesBillingOrder(payment, order);
      const reconciliation = await repos.lmwaresBillingOrders.reconcilePayment({
        id: order.id,
        paymentId: payment.id,
        providerStatus: payment.status,
        amountCents: Math.round(payment.amount * 100),
        currency: payment.currency,
        providerCreatedAt: payment.dateCreated,
      });
      await repos.lmwaresPayments.completeWebhookEvent({
        id: eventId,
        status: 'processed',
        proposalId: null,
        billingOrderId: order.id,
      });
      await repos.audit.record({
        actorType: 'system',
        actorId: 'mercado_pago',
        action: reconciliation.duplicatePayment
          ? 'lmwares.billing_order.duplicate_payment_detected'
          : 'lmwares.billing_order.webhook_reconciled',
        entityType: 'lmwares_billing_order',
        entityId: order.id,
        metadata: {
          providerPaymentId: payment.id,
          providerStatus: payment.status,
          orderStatus: reconciliation.order.status,
          disposition: reconciliation.disposition,
          duplicatePayment: reconciliation.duplicatePayment,
          providerRequestId,
          transport,
          signatureValidated,
        },
        ip: c.req.header('CF-Connecting-IP') ?? null,
        userAgent: c.req.header('User-Agent') ?? null,
      });
      return c.json({ received: true, commercialPayment: true, duplicatePayment: reconciliation.duplicatePayment });
    }
    const proposal = await repos.lmwaresPayments.getById(payment.externalReference);
    if (!proposal) {
      const subscription = maintenanceScope
        ? await repos.lmwaresMaintenanceSubscriptions.getByExternalReference(payment.externalReference)
        : await repos.lmwaresSubscriptions.getByExternalReference(payment.externalReference);
      if (subscription) {
        assertPaymentMatchesSubscription(payment, subscription);
        await repos.lmwaresPayments.completeWebhookEvent({
          id: eventId,
          status: 'processed',
          proposalId: null,
          subscriptionId: maintenanceScope ? null : subscription.id,
          maintenanceSubscriptionId: maintenanceScope ? subscription.id : null,
        });
        await repos.audit.record({
          actorType: 'system',
          actorId: 'mercado_pago',
          action: maintenanceScope
            ? 'lmwares.maintenance_subscription.payment_observed'
            : 'lmwares.subscription.payment_observed',
          entityType: maintenanceScope
            ? 'lmwares_maintenance_subscription'
            : 'lmwares_subscription',
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
  maintenanceScope: boolean,
  testMode: boolean,
) {
  const resourceId = c.req.query('data.id') ?? '';
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(resourceId)) {
    throw new AppError('unauthorized', 'Notificación de Mercado Pago inválida.');
  }
  const signature = await validateSignedWebhook(c, webhookSecrets, resourceId, testMode);
  const provider = await getMercadoPagoPreapproval({
    accessToken: maintenanceScope
      ? mercadoPagoMaintenanceAccessToken(c.env)
      : mercadoPagoSubscriptionsAccessToken(c.env),
    preapprovalId: resourceId,
  });
  const repos = createRepositories(c.env.DB);
  const providerRequestId = signature.validated
    ? `${maintenanceScope ? 'maintenance:' : ''}${signature.requestId}`
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
    const subscription = maintenanceScope
      ? (await repos.lmwaresMaintenanceSubscriptions.getByProviderPreapprovalId(provider.id)) ??
        (await repos.lmwaresMaintenanceSubscriptions.getByExternalReference(provider.externalReference))
      : (await repos.lmwaresSubscriptions.getByProviderPreapprovalId(provider.id)) ??
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
    const reconciled = maintenanceScope
      ? await repos.lmwaresMaintenanceSubscriptions.savePreapproval({
          id: subscription.id,
          externalReference: provider.externalReference,
          providerPreapprovalId: provider.id,
          authorizationUrl: provider.authorizationUrl,
          providerStatus: provider.status,
          nextPaymentDate: provider.nextPaymentDate,
        })
      : await repos.lmwaresSubscriptions.savePreapproval({
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
      subscriptionId: maintenanceScope ? null : subscription.id,
      maintenanceSubscriptionId: maintenanceScope ? subscription.id : null,
    });
    await repos.audit.record({
      actorType: 'system',
      actorId: 'mercado_pago',
      action: maintenanceScope
        ? 'lmwares.maintenance_subscription.preapproval_reconciled'
        : 'lmwares.subscription.preapproval_reconciled',
      entityType: maintenanceScope
        ? 'lmwares_maintenance_subscription'
        : 'lmwares_subscription',
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
  maintenanceScope: boolean,
  testMode: boolean,
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
      testMode &&
      /^[a-zA-Z0-9_-]{1,160}$/.test(resourceId)
    ) {
      const probeDataId = await readMercadoPagoSubscriptionProbeDataId(c);
      if (probeDataId) {
        const probeSignature = await validateSignedWebhook(c, webhookSecrets, probeDataId, testMode);
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
  const signature = await validateSignedWebhook(c, webhookSecrets, resourceId, testMode);
  const provider = await getMercadoPagoAuthorizedPayment({
    accessToken: maintenanceScope
      ? mercadoPagoMaintenanceAccessToken(c.env)
      : mercadoPagoSubscriptionsAccessToken(c.env),
    authorizedPaymentId: resourceId,
  });
  const repos = createRepositories(c.env.DB);
  const providerRequestId = signature.validated
    ? `${maintenanceScope ? 'maintenance:' : ''}${signature.requestId}`
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
    const subscription = maintenanceScope
      ? (await repos.lmwaresMaintenanceSubscriptions.getByProviderPreapprovalId(provider.preapprovalId)) ??
        (await repos.lmwaresMaintenanceSubscriptions.getByExternalReference(provider.externalReference))
      : (await repos.lmwaresSubscriptions.getByProviderPreapprovalId(provider.preapprovalId)) ??
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
    const reconciliationInput = {
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
    };
    const reconciled = maintenanceScope
      ? await repos.lmwaresMaintenanceSubscriptions.reconcileAuthorizedPayment(reconciliationInput)
      : await repos.lmwaresSubscriptions.reconcileAuthorizedPayment(reconciliationInput);
    await repos.lmwaresPayments.completeWebhookEvent({
      id: eventId,
      status: 'processed',
      proposalId: null,
      subscriptionId: maintenanceScope ? null : subscription.id,
      maintenanceSubscriptionId: maintenanceScope ? subscription.id : null,
    });
    await repos.audit.record({
      actorType: 'system',
      actorId: 'mercado_pago',
      action: maintenanceScope
        ? 'lmwares.maintenance_subscription.authorized_payment_reconciled'
        : 'lmwares.subscription.authorized_payment_reconciled',
      entityType: maintenanceScope
        ? 'lmwares_maintenance_subscription'
        : 'lmwares_subscription',
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
  testMode: boolean,
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
  if (!validated && !testMode) {
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
  assertTechnicalCheckoutEnabled(c.env);
  const input = parseInput(createTestPackageProposalSchema, await readJson(c));
  const modules = normalizePaidPackageModules(input.plan, input.modules);
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
  assertTechnicalCheckoutEnabled(c.env);
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

payments.get('/orders/:id', async (c) => {
  const session = await requirePublicSession(c);
  const order = await ownedBillingOrder(c.env, c.req.param('id'), session.user.id);
  c.header('Cache-Control', 'no-store');
  return c.json({ order: publicBillingOrder(order) });
});

payments.post('/orders/:id/checkout', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  assertCommercialPaymentConfiguration(c.env);
  const repos = createRepositories(c.env.DB);
  let order = await ownedBillingOrder(c.env, c.req.param('id'), session.user.id);
  if (checkoutBlocked(order)) throw new AppError('conflict', 'Esta orden ya no admite otro pago.');
  if (order.checkoutUrl && order.providerPreferenceId && order.status !== 'payment_failed') {
    if (billingCheckoutExpired(order)) {
      throw new AppError('conflict', 'Este checkout venció. Contacta a soporte para renovarlo.');
    }
    return c.json({ order: publicBillingOrder(order) });
  }
  if (!(await repos.lmwaresBillingOrders.claimCheckout(order.id))) {
    order = (await repos.lmwaresBillingOrders.getById(order.id))!;
    if (order.checkoutUrl && !billingCheckoutExpired(order)) {
      return c.json({ order: publicBillingOrder(order) });
    }
    throw new AppError('conflict', 'El checkout se está preparando. Intenta nuevamente en unos segundos.');
  }
  try {
    const preference = await createMercadoPagoBillingPreference({
      accessToken: mercadoPagoCommercialAccessToken(c.env),
      order,
      payerEmail: session.user.email,
      testMode: c.env.MERCADO_PAGO_COMMERCIAL_TEST_MODE === '1',
      publicApiUrl: c.env.PUBLIC_API_URL,
      publicWebUrl: c.env.PUBLIC_WEB_URL,
    });
    order = await repos.lmwaresBillingOrders.saveCheckout({
      id: order.id,
      preferenceId: preference.id,
      checkoutUrl: preference.checkoutUrl,
      checkoutExpiresAt: preference.expiresAt,
    });
  } catch (error) {
    await repos.lmwaresBillingOrders.markCheckoutFailed(order.id);
    throw error;
  }
  await auditBillingOrder(c, session.user.id, 'lmwares.billing_order.checkout_created', order, {
    providerPreferenceId: order.providerPreferenceId,
  });
  return c.json({ order: publicBillingOrder(order) });
});

payments.post('/orders/:id/reconcile', async (c) => {
  assertTrustedPublicOrigin(c);
  const session = await requirePublicSession(c);
  assertCommercialPaymentConfiguration(c.env);
  const repos = createRepositories(c.env.DB);
  let order = await ownedBillingOrder(c.env, c.req.param('id'), session.user.id);
  if (!order.providerPreferenceId) throw new AppError('conflict', 'Primero debes preparar el checkout.');
  const found = await searchMercadoPagoPayments({
    accessToken: mercadoPagoCommercialAccessToken(c.env),
    externalReference: order.externalReference,
  });
  for (const payment of [...found].sort((a, b) => paymentTimestamp(a.dateCreated) - paymentTimestamp(b.dateCreated))) {
    assertPaymentMatchesBillingOrder(payment, order);
    order = (await repos.lmwaresBillingOrders.reconcilePayment({
      id: order.id,
      paymentId: payment.id,
      providerStatus: payment.status,
      amountCents: Math.round(payment.amount * 100),
      currency: payment.currency,
      providerCreatedAt: payment.dateCreated,
    })).order;
  }
  await auditBillingOrder(c, session.user.id, 'lmwares.billing_order.reconciled', order, {
    paymentsFound: found.length,
    providerPaymentId: order.providerPaymentId,
    providerStatus: order.lastProviderStatus,
  });
  return c.json({ found: found.length > 0, order: publicBillingOrder(order) });
});

function checkoutExpired(proposal: PackageProposal): boolean {
  if (!proposal.checkoutExpiresAt) return false;
  const expiresAt = Date.parse(proposal.checkoutExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export function paymentTimestamp(value: string | null): number {
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

export function assertPaymentMatchesProposal(
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

export function assertPaymentMatchesBillingOrder(
  payment: { externalReference: string; currency: string; amount: number },
  order: BillingOrder,
): void {
  if (
    payment.externalReference !== order.externalReference ||
    payment.currency !== order.currency ||
    Math.round(payment.amount * 100) !== order.amountCents
  ) {
    throw new AppError('internal_error', 'El pago no coincide con la orden comercial congelada.');
  }
}

function assertPaymentMatchesSubscription(
  payment: {
    externalReference: string;
    currency: string;
    amount: number;
  },
  subscription: PackageSubscription | MaintenanceSubscription,
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
  subscription: PackageSubscription | MaintenanceSubscription,
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
  subscription: PackageSubscription | MaintenanceSubscription,
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

function assertTechnicalCheckoutEnabled(env: Bindings): void {
  if (env.MERCADO_PAGO_TECHNICAL_CHECKOUT_ENABLED !== '1') {
    throw new AppError('forbidden', 'La creación de checkouts técnicos está cerrada.');
  }
}

export function mercadoPagoSubscriptionsAccessToken(env: Bindings): string {
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
  application: 'checkout' | 'subscriptions' | 'commercial' | 'maintenance',
): string[] {
  if (application === 'commercial') {
    mercadoPagoCommercialAccessToken(env);
  } else if (application === 'maintenance') {
    mercadoPagoMaintenanceAccessToken(env);
  } else if (application === 'subscriptions') {
    mercadoPagoSubscriptionsAccessToken(env);
  } else if (!env.MERCADO_PAGO_ACCESS_TOKEN?.trim()) {
    throw new AppError('internal_error', 'Falta configurar el Access Token de Checkout Pro.');
  }
  const productionSecret =
    application === 'commercial'
      ? env.MERCADO_PAGO_COMMERCIAL_WEBHOOK_SECRET?.trim()
      : application === 'maintenance'
      ? env.MERCADO_PAGO_MAINTENANCE_WEBHOOK_SECRET?.trim()
      : application === 'subscriptions'
      ? env.MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_SECRET?.trim()
      : env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
  const testMode = application === 'commercial'
    ? env.MERCADO_PAGO_COMMERCIAL_TEST_MODE === '1'
    : application === 'maintenance'
    ? env.MERCADO_PAGO_MAINTENANCE_TEST_MODE === '1'
    : env.MERCADO_PAGO_TEST_MODE === '1';
  const testSecret =
    testMode
      ? application === 'commercial'
        ? env.MERCADO_PAGO_COMMERCIAL_WEBHOOK_TEST_SECRET?.trim()
        : application === 'maintenance'
        ? env.MERCADO_PAGO_MAINTENANCE_WEBHOOK_TEST_SECRET?.trim()
        : application === 'subscriptions'
        ? env.MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_TEST_SECRET?.trim()
        : env.MERCADO_PAGO_WEBHOOK_TEST_SECRET?.trim()
      : undefined;
  const secrets = [...new Set([productionSecret, testSecret].filter(Boolean) as string[])];
  if (secrets.length > 0) return secrets;
  if (!testMode) {
    throw new AppError('internal_error', 'Falta configurar la firma secreta de Webhooks.');
  }
  return [];
}

export function mercadoPagoCommercialAccessToken(env: Bindings): string {
  const token = env.MERCADO_PAGO_COMMERCIAL_ACCESS_TOKEN?.trim();
  if (!token) throw new AppError('internal_error', 'Falta configurar el Access Token comercial de Mercado Pago.');
  return token;
}

export function mercadoPagoMaintenanceAccessToken(env: Bindings): string {
  const token = env.MERCADO_PAGO_MAINTENANCE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new AppError('internal_error', 'Falta configurar el Access Token de mensualidades.');
  }
  return token;
}

function assertCommercialPaymentConfiguration(env: Bindings): void {
  if (env.MERCADO_PAGO_COMMERCIAL_PAYMENTS_ENABLED !== '1') {
    throw new AppError('forbidden', 'Los pagos comerciales aún no están habilitados.');
  }
  mercadoPagoCommercialAccessToken(env);
}

async function ownedBillingOrder(env: Bindings, id: string, userId: string): Promise<BillingOrder> {
  const order = await createRepositories(env.DB).lmwaresBillingOrders.getById(id);
  if (!order || order.userId !== userId) throw AppError.notFound('Orden de pago');
  return order;
}

function billingCheckoutExpired(order: BillingOrder): boolean {
  if (!order.checkoutExpiresAt) return false;
  const timestamp = Date.parse(order.checkoutExpiresAt);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

async function auditBillingOrder(
  c: Parameters<typeof requirePublicSession>[0],
  actorId: string,
  action: string,
  order: BillingOrder,
  metadata: Record<string, unknown>,
): Promise<void> {
  await createRepositories(c.env.DB).audit.record({
    actorType: 'public', actorId, action,
    entityType: 'lmwares_billing_order', entityId: order.id, metadata,
    ip: c.req.header('CF-Connecting-IP') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  });
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
