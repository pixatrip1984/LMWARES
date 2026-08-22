import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';
import type { PaidPackageModuleId, PaidPackagePlan } from './package-payment';
import type { DiscountPercent } from './discount-code';

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

/**
 * Brief mínimo capturado al enviar el intake: da contexto de negocio/contacto
 * al operador y al agente codificador para arrancar Fase 1-2 (construcción +
 * revisión del cliente). No incluye contenido fino de catálogo/galería; eso
 * se recaba en un segundo contacto una vez aprobado el proyecto.
 */
export interface PackageIntakeBrief {
  contactName: string;
  contactPhone: string;
  businessName: string;
  businessSummary: string;
  siteGoal: string;
  stylePreference: string | null;
  referenceNotes: string | null;
  customDomainPreference: string | null;
  maintenancePlanPreference: 'later' | 'none' | 'basic' | 'advanced';
  maintenanceSecurityAddOn: boolean;
}

/** Selección original del cliente. Nunca se sobreescribe con la oferta final. */
export interface PackageIntake extends Timestamps {
  id: Id;
  submissionKey: Id;
  userId: Id;
  plan: PaidPackagePlan;
  modules: PaidPackageModuleId[];
  marketing: boolean;
  brief: PackageIntakeBrief;
  status: PackageIntakeStatus;
  estimatedImplementationCents: number;
  estimatedMonthlyCents: number;
  currency: 'MXN';
  pricingVersion: string;
  maintenanceStartPolicy: MaintenanceStartPolicy;
  packageSnapshot: Metadata;
  discountCode: string | null;
  discountPercent: DiscountPercent | null;
  discountRedemptionId: Id | null;
  proposalId: Id | null;
  reviewedBy: string | null;
  reviewedAt: IsoDateTime | null;
  reviewNotes: string | null;
  submittedAt: IsoDateTime;
}
