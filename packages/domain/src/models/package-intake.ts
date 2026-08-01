import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';
import type { PaidPackageModuleId, PaidPackagePlan } from './package-payment';

export const PACKAGE_INTAKE_STATUSES = [
  'submitted',
  'scope_review',
  'offer_ready',
  'declined',
  'converted',
] as const;

export type PackageIntakeStatus = (typeof PACKAGE_INTAKE_STATUSES)[number];

export const MAINTENANCE_START_POLICIES = ['on_go_live'] as const;
export type MaintenanceStartPolicy = (typeof MAINTENANCE_START_POLICIES)[number];

/** Selección original del cliente. Nunca se sobreescribe con la oferta final. */
export interface PackageIntake extends Timestamps {
  id: Id;
  submissionKey: Id;
  userId: Id;
  plan: PaidPackagePlan;
  modules: PaidPackageModuleId[];
  marketing: boolean;
  status: PackageIntakeStatus;
  estimatedImplementationCents: number;
  estimatedMonthlyCents: number;
  currency: 'MXN';
  pricingVersion: string;
  maintenanceStartPolicy: MaintenanceStartPolicy;
  packageSnapshot: Metadata;
  proposalId: Id | null;
  reviewedBy: string | null;
  reviewedAt: IsoDateTime | null;
  reviewNotes: string | null;
  submittedAt: IsoDateTime;
}
