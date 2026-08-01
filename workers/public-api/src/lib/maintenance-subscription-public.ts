import type { MaintenanceSubscription } from '@starter/domain';

export function publicMaintenanceSubscription(subscription: MaintenanceSubscription) {
  return {
    id: subscription.id,
    workOrderId: subscription.workOrderId,
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
