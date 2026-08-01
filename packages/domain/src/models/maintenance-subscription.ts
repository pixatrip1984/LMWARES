import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';
import type { PackageSubscriptionStatus } from './package-subscription';

export interface MaintenanceSubscription extends Timestamps {
  id: Id;
  workOrderId: Id;
  intakeId: Id;
  commercialOfferId: Id;
  userId: Id;
  status: PackageSubscriptionStatus;
  amountCents: number;
  currency: 'MXN';
  frequency: 1;
  frequencyType: 'months';
  pricingVersion: string;
  subscriptionSnapshot: Metadata;
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
