import type { PackageSubscriptionStatus } from './package-subscription';

export function subscriptionStatusFromProvider(
  providerStatus: string,
): PackageSubscriptionStatus {
  switch (providerStatus.toLowerCase()) {
    case 'authorized':
      return 'active';
    case 'paused':
      return 'paused';
    case 'cancelled':
    case 'canceled':
      return 'canceled';
    case 'pending':
      return 'pending_authorization';
    default:
      return 'payment_attention';
  }
}

export function subscriptionStatusFromCharge(
  providerStatus: string,
  paymentStatus: string | null,
  currentStatus: PackageSubscriptionStatus,
): PackageSubscriptionStatus {
  const status = (paymentStatus ?? providerStatus).toLowerCase();
  if (status === 'charged_back') return 'disputed';
  if (status === 'refunded') return 'disputed';
  if (status === 'approved') return 'active';
  if (['rejected', 'cancelled', 'canceled'].includes(status)) return 'payment_attention';
  return currentStatus;
}
