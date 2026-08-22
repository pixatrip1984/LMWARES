import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';

export const BILLING_ORDER_STATUSES = [
  'ready',
  'checkout_creating',
  'checkout_failed',
  'payment_pending',
  'payment_failed',
  'paid',
  'refunded',
  'charged_back',
  'canceled',
] as const;

export type BillingOrderStatus = (typeof BILLING_ORDER_STATUSES)[number];
export type BillingOrderPurpose = 'implementation' | 'cart' | 'domain';

export interface BillingOrder extends Timestamps {
  id: Id;
  purpose: BillingOrderPurpose;
  commercialOfferId: Id | null;
  intakeId: Id | null;
  userId: Id;
  status: BillingOrderStatus;
  /**
   * Fase de pago de implementación (1-4, 25% cada una). Las órdenes de pago
   * único históricas conservan `phase: 1` con el 100% del importe.
   */
  phase: 1 | 2 | 3 | 4;
  amountCents: number;
  currency: 'MXN';
  orderSnapshot: Metadata;
  externalReference: string;
  provider: 'mercado_pago';
  providerPreferenceId: string | null;
  providerPaymentId: string | null;
  checkoutUrl: string | null;
  checkoutExpiresAt: IsoDateTime | null;
  lastProviderStatus: string | null;
  paymentReviewRequired: boolean;
  paidAt: IsoDateTime | null;
}
