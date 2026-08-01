import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';
import type { MaintenanceStartPolicy } from './package-intake';
import type { PaidPackageModuleId, PaidPackagePlan } from './package-payment';

export const COMMERCIAL_OFFER_STATUSES = [
  'issued',
  'accepted',
  'superseded',
  'declined',
  'expired',
] as const;

export type CommercialOfferStatus = (typeof COMMERCIAL_OFFER_STATUSES)[number];

export interface CommercialOffer extends Timestamps {
  id: Id;
  intakeId: Id;
  userId: Id;
  version: number;
  status: CommercialOfferStatus;
  plan: PaidPackagePlan;
  modules: PaidPackageModuleId[];
  marketing: boolean;
  implementationAmountCents: number;
  monthlyAmountCents: number;
  currency: 'MXN';
  scopeSummary: string;
  implementationDescription: string;
  recurringDescription: string;
  maintenanceStartPolicy: MaintenanceStartPolicy;
  termsVersion: string;
  termsSnapshot: Metadata;
  validUntil: IsoDateTime;
  issuedBy: string;
  issuedAt: IsoDateTime;
  acceptedAt: IsoDateTime | null;
}
