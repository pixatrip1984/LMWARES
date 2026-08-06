import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';
import type { MaintenanceStartPolicy } from './package-intake';
import type { PaidPackageModuleId, PaidPackagePlan } from './package-payment';
import type { MaintenancePlanTier } from './package-pricing';

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
  /**
   * Plan de mantenimiento ya decidido (`null` mientras el cliente eligió
   * "configurar luego" y todavía no elige un plan real). Cuando no es `null`,
   * `monthlyAmountCents` se deriva de este plan, no de un monto libre.
   */
  maintenancePlanSelected: MaintenancePlanTier | null;
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
