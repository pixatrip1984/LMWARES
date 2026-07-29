import { Hono } from 'hono';
import {
  AppError,
  type PackageProposal,
  type PaidPackageModuleId,
} from '@starter/domain';
import { createRepositories } from '@starter/db';
import {
  createTestPackageProposalSchema,
  parseInput,
} from '@starter/validation';
import type { Bindings, Variables } from '../env';
import {
  createMercadoPagoPreference,
  getMercadoPagoPayment,
  proposalStatusForProviderStatus,
  searchMercadoPagoPayments,
  verifyMercadoPagoWebhookSignature,
} from '../lib/mercado-pago';
import {
  assertTrustedPublicOrigin,
  requirePublicSession,
} from '../middleware/public-auth';

const TEST_AMOUNT_CENTS = 500;
const TEST_PRICING_VERSION = 'technical-mxn-5-v1';

export const payments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

payments.post('/webhooks/mercado-pago', async (c) => {
  const webhookSecrets = mercadoPagoWebhookSecrets(c.env);
  const topic = c.req.query('type') ?? c.req.query('topic') ?? '';
  if (topic !== 'payment') {
    return c.json({ received: true, ignored: true });
  }

  const signedDataId = c.req.query('data.id') ?? '';
  const paymentId = signedDataId || c.req.query('id') || '';
  const requestId = c.req.header('x-request-id') ?? '';
  const signature = c.req.header('x-signature') ?? '';
  if (!/^\d{1,32}$/.test(paymentId) || !requestId || requestId.length > 200 || !signature) {
    throw new AppError('unauthorized', 'Notificación de Mercado Pago inválida.');
  }

  if (webhookSecrets.length > 0) {
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
    const validSignature = signatureChecks.some(Boolean);
    if (!validSignature) {
      throw new AppError('unauthorized', 'Firma de Mercado Pago inválida.');
    }
  } else {
    console.warn(
      JSON.stringify({
        message: 'mercado_pago_test_webhook_signature_not_verified',
        paymentId,
        requestId,
      }),
    );
  }

  const repos = createRepositories(c.env.DB);
  const eventId = await repos.lmwaresPayments.claimWebhookEvent({
    providerRequestId: webhookSecrets.length > 0 ? requestId : `test-payment:${paymentId}`,
    topic,
    resourceId: paymentId,
  });
  if (!eventId) {
    return c.json({ received: true, duplicate: true });
  }

  try {
    const payment = await getMercadoPagoPayment({
      accessToken: c.env.MERCADO_PAGO_ACCESS_TOKEN,
      paymentId,
    });
    const proposal = await repos.lmwaresPayments.getById(payment.externalReference);
    if (!proposal) {
      await repos.lmwaresPayments.completeWebhookEvent({
        id: eventId,
        status: 'ignored',
        proposalId: null,
      });
      return c.json({ received: true, ignored: true });
    }

    assertPaymentMatchesProposal(payment, proposal);
    const updated = await repos.lmwaresPayments.savePayment({
      id: proposal.id,
      paymentId: payment.id,
      providerStatus: payment.status,
      status: proposalStatusForProviderStatus(payment.status),
    });
    await repos.lmwaresPayments.completeWebhookEvent({
      id: eventId,
      status: 'processed',
      proposalId: proposal.id,
    });
    await repos.audit.record({
      actorType: 'system',
      actorId: 'mercado_pago',
      action: 'lmwares.package_proposal.webhook_reconciled',
      entityType: 'lmwares_package_proposal',
      entityId: proposal.id,
      metadata: {
        providerPaymentId: payment.id,
        providerStatus: payment.status,
        proposalStatus: updated.status,
        providerRequestId: requestId,
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
});

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

  if (proposal.checkoutUrl && proposal.providerPreferenceId) {
    return c.json({ proposal: publicProposal(proposal) });
  }
  if (proposal.status === 'paid') {
    throw new AppError('conflict', 'Esta prueba ya fue pagada.');
  }

  const claimed = await repos.lmwaresPayments.claimCheckout(proposal.id);
  if (!claimed) {
    proposal = (await repos.lmwaresPayments.getById(proposal.id))!;
    if (proposal.checkoutUrl) return c.json({ proposal: publicProposal(proposal) });
    throw new AppError('conflict', 'El checkout se está preparando. Intenta nuevamente en unos segundos.');
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
  const payment =
    paymentsFound.find((candidate) => candidate.status === 'approved') ?? paymentsFound[0] ?? null;

  if (!payment) {
    return c.json({ found: false, proposal: publicProposal(proposal) });
  }
  assertPaymentMatchesProposal(payment, proposal);
  proposal = await repos.lmwaresPayments.savePayment({
    id: proposal.id,
    paymentId: payment.id,
    providerStatus: payment.status,
    status: proposalStatusForProviderStatus(payment.status),
  });
  await audit(c, session.user.id, 'lmwares.package_proposal.reconciled', proposal, {
    providerPaymentId: payment.id,
    providerStatus: payment.status,
  });
  return c.json({ found: true, proposal: publicProposal(proposal) });
});

function normalizeAndValidateModules(
  plan: 'starter' | 'pro',
  input: PaidPackageModuleId[],
): PaidPackageModuleId[] {
  const modules = [...new Set(input)];
  if (!modules.includes('landing') || !modules.includes('panel')) {
    throw new AppError('validation_error', 'Landing y Panel son obligatorios en los paquetes pagados.');
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
    throw new AppError('internal_error', 'El pago encontrado no coincide con la propuesta congelada.');
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
    throw new AppError('internal_error', 'Falta configurar el Access Token de prueba de Mercado Pago.');
  }
}

function mercadoPagoWebhookSecrets(env: Bindings): string[] {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN?.trim()) {
    throw new AppError('internal_error', 'Falta configurar el Access Token de Mercado Pago.');
  }
  const productionSecret = env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
  const testSecret =
    env.MERCADO_PAGO_TEST_MODE === '1'
      ? env.MERCADO_PAGO_WEBHOOK_TEST_SECRET?.trim()
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
    lastProviderStatus: proposal.lastProviderStatus,
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
