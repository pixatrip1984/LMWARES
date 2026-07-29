import type { Id, IsoDateTime, Timestamps } from '../common';

export const PACKAGE_SUBSCRIPTION_STATUSES = [
  'creating',
  'creation_failed',
  'pending_authorization',
  'active',
  'payment_attention',
  'paused',
  'canceled',
  'disputed',
] as const;
export type PackageSubscriptionStatus = (typeof PACKAGE_SUBSCRIPTION_STATUSES)[number];

export interface PackageSubscription extends Timestamps {
  id: Id;
  proposalId: Id;
  userId: Id;
  status: PackageSubscriptionStatus;
  amountCents: number;
  currency: 'MXN';
  frequency: number;
  frequencyType: 'months';
  pricingVersion: string;
  provider: 'mercado_pago';
  providerPreapprovalId: string | null;
  authorizationUrl: string | null;
  externalReference: string;
  providerStatus: string | null;
  nextPaymentDate: IsoDateTime | null;
  lastAuthorizedPaymentId: string | null;
  lastAuthorizedPaymentStatus: string | null;
  authorizedAt: IsoDateTime | null;
  canceledAt: IsoDateTime | null;
}

export interface PackageSubscriptionCharge extends Timestamps {
  id: Id;
  subscriptionId: Id;
  providerAuthorizedPaymentId: string;
  providerPaymentId: string | null;
  status: string;
  summarized: string | null;
  amountCents: number;
  currency: string;
  debitDate: IsoDateTime | null;
  retryAttempt: number;
}
