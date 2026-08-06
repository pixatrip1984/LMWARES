import {
  AppError,
  type BillingOrder,
  type MaintenanceSubscription,
  type PackageProposal,
  type PackageSubscription,
} from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings } from '../env';
import {
  getMercadoPagoPreapproval,
  searchMercadoPagoAuthorizedPayments,
  searchMercadoPagoPayments,
  type MercadoPagoAuthorizedPayment,
  type MercadoPagoPreapproval,
} from './mercado-pago';
import {
  assertPaymentMatchesBillingOrder,
  assertPaymentMatchesProposal,
  mercadoPagoCommercialAccessToken,
  paymentTimestamp,
} from '../routes/payments';

const RECONCILIATION_BATCH_SIZE = 25;

export interface SubscriptionReconciliationResult {
  subscription: PackageSubscription;
  authorizedPaymentsFound: number;
}

export interface MaintenanceSubscriptionReconciliationResult {
  subscription: MaintenanceSubscription;
  authorizedPaymentsFound: number;
}

export async function reconcileSubscriptionWithProvider(input: {
  env: Bindings;
  subscription: PackageSubscription;
  accessToken: string;
}): Promise<SubscriptionReconciliationResult> {
  const repos = createRepositories(input.env.DB);
  const providerPreapprovalId = input.subscription.providerPreapprovalId;
  if (!providerPreapprovalId) {
    throw new AppError('conflict', 'La suscripción todavía no existe en Mercado Pago.');
  }

  const provider = await getMercadoPagoPreapproval({
    accessToken: input.accessToken,
    preapprovalId: providerPreapprovalId,
  });
  assertPreapprovalMatchesSubscription(provider, input.subscription);
  let subscription = await repos.lmwaresSubscriptions.savePreapproval({
    id: input.subscription.id,
    providerPreapprovalId: provider.id,
    authorizationUrl: provider.authorizationUrl,
    providerStatus: provider.status,
    nextPaymentDate: provider.nextPaymentDate,
  });

  const authorizedPayments = await searchMercadoPagoAuthorizedPayments({
    accessToken: input.accessToken,
    preapprovalId: provider.id,
  });
  authorizedPayments.sort(compareAuthorizedPayments);
  for (const authorizedPayment of authorizedPayments) {
    assertAuthorizedPaymentMatchesSubscription(authorizedPayment, subscription);
    subscription = await repos.lmwaresSubscriptions.reconcileAuthorizedPayment({
      subscriptionId: subscription.id,
      providerAuthorizedPaymentId: authorizedPayment.id,
      providerPaymentId: authorizedPayment.paymentId,
      providerStatus: authorizedPayment.status,
      paymentStatus: authorizedPayment.paymentStatus,
      summarized: authorizedPayment.summarized,
      amountCents: Math.round(authorizedPayment.amount * 100),
      currency: authorizedPayment.currency,
      debitDate: authorizedPayment.debitDate,
      retryAttempt: authorizedPayment.retryAttempt,
    });
  }

  return { subscription, authorizedPaymentsFound: authorizedPayments.length };
}

export async function reconcileSubscriptionsOnSchedule(
  env: Bindings,
  scheduledTime: number,
): Promise<void> {
  const repos = createRepositories(env.DB);
  const accessToken = env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN?.trim();
  const candidates = accessToken
    ? await repos.lmwaresSubscriptions.listForReconciliation(RECONCILIATION_BATCH_SIZE)
    : [];
  let processed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const result = await reconcileSubscriptionWithProvider({
        env,
        subscription: candidate,
        accessToken: accessToken!,
      });
      processed += 1;
      if (subscriptionMateriallyChanged(candidate, result.subscription)) {
        await repos.audit.record({
          actorType: 'system',
          actorId: 'subscription_reconciliation_cron',
          action: 'lmwares.subscription.scheduled_reconcile',
          entityType: 'lmwares_subscription',
          entityId: candidate.id,
          metadata: {
            scheduledTime,
            previousStatus: candidate.status,
            status: result.subscription.status,
            authorizedPaymentsFound: result.authorizedPaymentsFound,
            lastAuthorizedPaymentId: result.subscription.lastAuthorizedPaymentId,
          },
          ip: null,
          userAgent: null,
        });
      }
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify({
          message: 'subscription_scheduled_reconciliation_failed',
          subscriptionId: candidate.id,
          errorCode: error instanceof AppError ? error.code : 'internal_error',
        }),
      );
    }
  }
  console.info(
    JSON.stringify({
      message: 'subscription_scheduled_reconciliation_completed',
      scheduledTime,
      candidates: candidates.length,
      processed,
      failed,
    }),
  );
  await reconcileMaintenanceSubscriptionsOnSchedule(env, scheduledTime);
  await reconcileBillingOrdersOnSchedule(env, scheduledTime);
  await reconcilePackageProposalsOnSchedule(env, scheduledTime);
  await alertOnStuckPaymentsIfNeeded(env);
}

const STUCK_ALERT_THRESHOLD_HOURS = 3;
const STUCK_ALERT_COOLDOWN_HOURS = 12;
const STUCK_ALERT_ACTION = 'ops.stuck_payments_alert_sent';

/**
 * Si hay pagos sin reconciliar por más de STUCK_ALERT_THRESHOLD_HOURS, envía un
 * correo al admin. Se limita a un correo cada STUCK_ALERT_COOLDOWN_HOURS para no
 * saturar la bandeja mientras el mismo pago sigue atascado.
 */
async function alertOnStuckPaymentsIfNeeded(env: Bindings): Promise<void> {
  const to = env.ADMIN_ALERT_EMAIL?.trim();
  if (!to) return;
  const repos = createRepositories(env.DB);
  const [billingOrders, packageProposals, packageSubscriptions, maintenanceSubscriptions] =
    await Promise.all([
      repos.lmwaresBillingOrders.countStuck(STUCK_ALERT_THRESHOLD_HOURS),
      repos.lmwaresPayments.countStuck(STUCK_ALERT_THRESHOLD_HOURS),
      repos.lmwaresSubscriptions.countStuck(STUCK_ALERT_THRESHOLD_HOURS),
      repos.lmwaresMaintenanceSubscriptions.countStuck(STUCK_ALERT_THRESHOLD_HOURS),
    ]);
  const total = billingOrders + packageProposals + packageSubscriptions + maintenanceSubscriptions;
  if (total === 0) return;

  const cooldownSince = new Date(Date.now() - STUCK_ALERT_COOLDOWN_HOURS * 3_600_000).toISOString();
  if (await repos.audit.existsSince(STUCK_ALERT_ACTION, cooldownSince)) return;

  try {
    await env.EMAIL.send({
      to,
      from: { email: env.EMAIL_FROM, name: 'LMWares' },
      replyTo: env.EMAIL_REPLY_TO,
      subject: `[LMWares] ${total} pago(s) sin confirmar hace más de ${STUCK_ALERT_THRESHOLD_HOURS}h`,
      text:
        `El cron de reconciliación no logró confirmar ${total} pago(s) pendiente(s) por más de ` +
        `${STUCK_ALERT_THRESHOLD_HOURS} horas.\n\n` +
        `Fases de implementación: ${billingOrders}\n` +
        `Propuestas de paquete: ${packageProposals}\n` +
        `Mensualidades de paquete: ${packageSubscriptions}\n` +
        `Mensualidades de mantenimiento: ${maintenanceSubscriptions}\n\n` +
        `Revisa el panel de administración o el estado en Mercado Pago.`,
      html:
        `<p>El cron de reconciliación no logró confirmar <strong>${total}</strong> pago(s) ` +
        `pendiente(s) por más de ${STUCK_ALERT_THRESHOLD_HOURS} horas.</p>` +
        `<ul>` +
        `<li>Fases de implementación: ${billingOrders}</li>` +
        `<li>Propuestas de paquete: ${packageProposals}</li>` +
        `<li>Mensualidades de paquete: ${packageSubscriptions}</li>` +
        `<li>Mensualidades de mantenimiento: ${maintenanceSubscriptions}</li>` +
        `</ul>` +
        `<p>Revisa el panel de administración o el estado en Mercado Pago.</p>`,
    });
    await repos.audit.record({
      actorType: 'system',
      actorId: 'subscription_reconciliation_cron',
      action: STUCK_ALERT_ACTION,
      metadata: { total, billingOrders, packageProposals, packageSubscriptions, maintenanceSubscriptions },
      ip: null,
      userAgent: null,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'stuck_payments_alert_email_failed',
        errorCode: error instanceof AppError ? error.code : 'internal_error',
      }),
    );
  }
}

export async function reconcileMaintenanceSubscriptionWithProvider(input: {
  env: Bindings;
  subscription: MaintenanceSubscription;
  accessToken: string;
}): Promise<MaintenanceSubscriptionReconciliationResult> {
  const repos = createRepositories(input.env.DB);
  if (!input.subscription.providerPreapprovalId) {
    throw new AppError('conflict', 'La mensualidad todavía no existe en Mercado Pago.');
  }
  const provider = await getMercadoPagoPreapproval({
    accessToken: input.accessToken,
    preapprovalId: input.subscription.providerPreapprovalId,
  });
  assertPreapprovalMatchesSubscription(provider, input.subscription);
  let subscription = await repos.lmwaresMaintenanceSubscriptions.savePreapproval({
    id: input.subscription.id,
    providerPreapprovalId: provider.id,
    authorizationUrl: provider.authorizationUrl,
    providerStatus: provider.status,
    nextPaymentDate: provider.nextPaymentDate,
  });
  const charges = await searchMercadoPagoAuthorizedPayments({
    accessToken: input.accessToken,
    preapprovalId: provider.id,
  });
  charges.sort(compareAuthorizedPayments);
  for (const charge of charges) {
    assertAuthorizedPaymentMatchesSubscription(charge, subscription);
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
  return { subscription, authorizedPaymentsFound: charges.length };
}

async function reconcileMaintenanceSubscriptionsOnSchedule(
  env: Bindings,
  scheduledTime: number,
): Promise<void> {
  const accessToken = env.MERCADO_PAGO_MAINTENANCE_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    console.warn(JSON.stringify({ message: 'maintenance_reconciliation_disabled' }));
    return;
  }
  const repos = createRepositories(env.DB);
  const candidates = await repos.lmwaresMaintenanceSubscriptions.listForReconciliation(
    RECONCILIATION_BATCH_SIZE,
  );
  let processed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const result = await reconcileMaintenanceSubscriptionWithProvider({
        env,
        subscription: candidate,
        accessToken,
      });
      processed += 1;
      if (subscriptionMateriallyChanged(candidate, result.subscription)) {
        await repos.audit.record({
          actorType: 'system',
          actorId: 'maintenance_reconciliation_cron',
          action: 'lmwares.maintenance_subscription.scheduled_reconcile',
          entityType: 'lmwares_maintenance_subscription',
          entityId: candidate.id,
          metadata: {
            scheduledTime,
            previousStatus: candidate.status,
            status: result.subscription.status,
            authorizedPaymentsFound: result.authorizedPaymentsFound,
            lastAuthorizedPaymentId: result.subscription.lastAuthorizedPaymentId,
          },
          ip: null,
          userAgent: null,
        });
      }
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        message: 'maintenance_scheduled_reconciliation_failed',
        subscriptionId: candidate.id,
        errorCode: error instanceof AppError ? error.code : 'internal_error',
      }));
    }
  }
  console.info(JSON.stringify({
    message: 'maintenance_scheduled_reconciliation_completed',
    scheduledTime,
    candidates: candidates.length,
    processed,
    failed,
  }));
}

export function assertPreapprovalMatchesSubscription(
  provider: MercadoPagoPreapproval,
  subscription: PackageSubscription | MaintenanceSubscription,
): void {
  if (
    provider.id !== subscription.providerPreapprovalId ||
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

function compareAuthorizedPayments(
  left: MercadoPagoAuthorizedPayment,
  right: MercadoPagoAuthorizedPayment,
): number {
  const dateComparison = (left.debitDate ?? '').localeCompare(right.debitDate ?? '');
  return dateComparison || left.id.localeCompare(right.id, undefined, { numeric: true });
}

export async function reconcileBillingOrdersOnSchedule(
  env: Bindings,
  scheduledTime: number,
): Promise<void> {
  const repos = createRepositories(env.DB);
  let accessToken: string | null = null;
  try {
    accessToken = mercadoPagoCommercialAccessToken(env);
  } catch {
    accessToken = null;
  }
  const candidates = accessToken
    ? await repos.lmwaresBillingOrders.listForReconciliation(RECONCILIATION_BATCH_SIZE)
    : [];
  let processed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    if (!candidate.providerPreferenceId) continue;
    try {
      const found = await searchMercadoPagoPayments({
        accessToken: accessToken!,
        externalReference: candidate.externalReference,
      });
      let order: BillingOrder = candidate;
      const ordered = [...found].sort(
        (left, right) => paymentTimestamp(left.dateCreated) - paymentTimestamp(right.dateCreated),
      );
      for (const payment of ordered) {
        assertPaymentMatchesBillingOrder(payment, order);
        const reconciliation = await repos.lmwaresBillingOrders.reconcilePayment({
          id: order.id,
          paymentId: payment.id,
          providerStatus: payment.status,
          amountCents: Math.round(payment.amount * 100),
          currency: payment.currency,
          providerCreatedAt: payment.dateCreated,
        });
        order = reconciliation.order;
      }
      processed += 1;
      if (order.status !== candidate.status) {
        await repos.audit.record({
          actorType: 'system',
          actorId: 'subscription_reconciliation_cron',
          action: 'lmwares.billing_order.scheduled_reconcile',
          entityType: 'lmwares_billing_order',
          entityId: candidate.id,
          metadata: {
            scheduledTime,
            previousStatus: candidate.status,
            status: order.status,
            paymentsFound: ordered.length,
          },
          ip: null,
          userAgent: null,
        });
      }
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify({
          message: 'billing_order_scheduled_reconciliation_failed',
          billingOrderId: candidate.id,
          errorCode: error instanceof AppError ? error.code : 'internal_error',
        }),
      );
    }
  }
  console.info(
    JSON.stringify({
      message: 'billing_order_scheduled_reconciliation_completed',
      scheduledTime,
      candidates: candidates.length,
      processed,
      failed,
    }),
  );
}

export async function reconcilePackageProposalsOnSchedule(
  env: Bindings,
  scheduledTime: number,
): Promise<void> {
  const repos = createRepositories(env.DB);
  const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  const candidates = accessToken
    ? await repos.lmwaresPayments.listForReconciliation(RECONCILIATION_BATCH_SIZE)
    : [];
  let processed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    if (!candidate.providerPreferenceId) continue;
    try {
      const found = await searchMercadoPagoPayments({
        accessToken: accessToken!,
        externalReference: candidate.id,
      });
      let proposal: PackageProposal = candidate;
      const ordered = [...found].sort(
        (left, right) => paymentTimestamp(left.dateCreated) - paymentTimestamp(right.dateCreated),
      );
      for (const payment of ordered) {
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
      }
      processed += 1;
      if (proposal.status !== candidate.status) {
        await repos.audit.record({
          actorType: 'system',
          actorId: 'subscription_reconciliation_cron',
          action: 'lmwares.package_proposal.scheduled_reconcile',
          entityType: 'lmwares_package_proposal',
          entityId: candidate.id,
          metadata: {
            scheduledTime,
            previousStatus: candidate.status,
            status: proposal.status,
            paymentsFound: ordered.length,
          },
          ip: null,
          userAgent: null,
        });
      }
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify({
          message: 'package_proposal_scheduled_reconciliation_failed',
          proposalId: candidate.id,
          errorCode: error instanceof AppError ? error.code : 'internal_error',
        }),
      );
    }
  }
  console.info(
    JSON.stringify({
      message: 'package_proposal_scheduled_reconciliation_completed',
      scheduledTime,
      candidates: candidates.length,
      processed,
      failed,
    }),
  );
}

function subscriptionMateriallyChanged(
  before: PackageSubscription | MaintenanceSubscription,
  after: PackageSubscription | MaintenanceSubscription,
): boolean {
  return (
    before.status !== after.status ||
    before.providerStatus !== after.providerStatus ||
    before.nextPaymentDate !== after.nextPaymentDate ||
    before.lastAuthorizedPaymentId !== after.lastAuthorizedPaymentId ||
    before.lastAuthorizedPaymentStatus !== after.lastAuthorizedPaymentStatus ||
    before.canceledAt !== after.canceledAt
  );
}
