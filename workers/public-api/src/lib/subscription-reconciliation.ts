import { AppError, type PackageSubscription } from '@starter/domain';
import { createRepositories } from '@starter/db';
import type { Bindings } from '../env';
import {
  getMercadoPagoPreapproval,
  searchMercadoPagoAuthorizedPayments,
  type MercadoPagoAuthorizedPayment,
  type MercadoPagoPreapproval,
} from './mercado-pago';

const RECONCILIATION_BATCH_SIZE = 25;

export interface SubscriptionReconciliationResult {
  subscription: PackageSubscription;
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
  const accessToken = env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    console.warn(JSON.stringify({ message: 'subscription_reconciliation_disabled' }));
    return;
  }

  const repos = createRepositories(env.DB);
  const candidates =
    await repos.lmwaresSubscriptions.listForReconciliation(RECONCILIATION_BATCH_SIZE);
  let processed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const result = await reconcileSubscriptionWithProvider({
        env,
        subscription: candidate,
        accessToken,
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
}

export function assertPreapprovalMatchesSubscription(
  provider: MercadoPagoPreapproval,
  subscription: PackageSubscription,
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

function compareAuthorizedPayments(
  left: MercadoPagoAuthorizedPayment,
  right: MercadoPagoAuthorizedPayment,
): number {
  const dateComparison = (left.debitDate ?? '').localeCompare(right.debitDate ?? '');
  return dateComparison || left.id.localeCompare(right.id, undefined, { numeric: true });
}

function subscriptionMateriallyChanged(
  before: PackageSubscription,
  after: PackageSubscription,
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
