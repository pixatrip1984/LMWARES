import type { BillingOrder } from '@starter/domain';

export function publicBillingOrder(order: BillingOrder) {
  return {
    id: order.id,
    purpose: order.purpose,
    commercialOfferId: order.commercialOfferId,
    intakeId: order.intakeId,
    status: order.status,
    phase: order.phase,
    amountCents: order.amountCents,
    currency: order.currency,
    checkoutUrl: order.checkoutUrl,
    checkoutExpiresAt: order.checkoutExpiresAt,
    lastProviderStatus: order.lastProviderStatus,
    paymentReviewRequired: order.paymentReviewRequired,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
