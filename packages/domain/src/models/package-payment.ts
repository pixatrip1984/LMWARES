import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';

export const PAID_PACKAGE_PLANS = ['starter', 'pro'] as const;
export type PaidPackagePlan = (typeof PAID_PACKAGE_PLANS)[number];

export const PACKAGE_MODULE_IDS = [
  'landing',
  'panel',
  'blog',
  'galleries',
  'catalog',
  'quote',
  'events',
  'docs',
  'cart',
  'data',
] as const;
export type PaidPackageModuleId = (typeof PACKAGE_MODULE_IDS)[number];

export const PACKAGE_PROPOSAL_STATUSES = [
  'approved_test',
  'checkout_creating',
  'checkout_failed',
  'payment_pending',
  'payment_failed',
  'paid',
] as const;
export type PackageProposalStatus = (typeof PACKAGE_PROPOSAL_STATUSES)[number];

export interface PackageProposal extends Timestamps {
  id: Id;
  userId: Id;
  plan: PaidPackagePlan;
  modules: PaidPackageModuleId[];
  marketing: boolean;
  status: PackageProposalStatus;
  amountCents: number;
  currency: 'MXN';
  pricingVersion: string;
  packageSnapshot: Metadata;
  provider: 'mercado_pago';
  providerPreferenceId: string | null;
  providerPaymentId: string | null;
  checkoutUrl: string | null;
  checkoutExpiresAt: IsoDateTime | null;
  lastProviderStatus: string | null;
  paymentReviewRequired: boolean;
  paidAt: IsoDateTime | null;
}
