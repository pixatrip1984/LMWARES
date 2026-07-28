import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';

export const FREE_INTAKE_STATUSES = [
  'draft',
  'submitted',
  'queued',
  'generating',
  'validating',
  'published',
  'notified',
  'needs_information',
  'generation_failed',
  'moderation_hold',
  'manual_review',
] as const;
export type FreeIntakeStatus = (typeof FREE_INTAKE_STATUSES)[number];

export const FREE_CONTACT_PLATFORMS = [
  'instagram',
  'facebook',
  'x',
  'whatsapp',
  'phone',
  'email',
  'address',
  'website',
  'telegram',
  'tiktok',
  'other',
] as const;
export type FreeContactPlatform = (typeof FREE_CONTACT_PLATFORMS)[number];

export const FREE_ASSET_SAFETY_STATUSES = [
  'uploaded',
  'quarantined',
  'sanitized',
  'rejected',
  'needs_review',
] as const;
export type FreeAssetSafetyStatus = (typeof FREE_ASSET_SAFETY_STATUSES)[number];

export const FREE_JOB_STATUSES = [
  'queued',
  'claimed',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type FreeGenerationJobStatus = (typeof FREE_JOB_STATUSES)[number];

export interface FreeIntake extends Timestamps {
  id: Id;
  slug: string;
  siteName: string;
  status: FreeIntakeStatus;
  contactName: string;
  contactEmail: string;
  businessDescription: string;
  audience: string;
  sector: string | null;
  style: string;
  primaryAction: string;
  requestId: Id | null;
  termsAcceptedAt: IsoDateTime | null;
  publishedUrl: string | null;
  qrAssetId: Id | null;
  generationJobId: Id | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Metadata;
  submittedAt: IsoDateTime | null;
  publishedAt: IsoDateTime | null;
}

export interface FreeContactMethod {
  id: Id;
  intakeId: Id;
  platform: FreeContactPlatform;
  value: string;
  label: string | null;
  publicVisible: boolean;
  position: number;
  createdAt: IsoDateTime;
}

export interface FreeIntakeAsset {
  id: Id;
  intakeId: Id;
  fileAssetId: Id;
  role: string;
  position: number;
  safetyStatus: FreeAssetSafetyStatus;
  checksum: string | null;
  width: number | null;
  height: number | null;
  createdAt: IsoDateTime;
}

export interface FreeGenerationJob extends Timestamps {
  id: Id;
  intakeId: Id;
  type: string;
  status: FreeGenerationJobStatus;
  attempt: number;
  leaseUntil: IsoDateTime | null;
  claimedBy: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Metadata;
  queuedAt: IsoDateTime | null;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
}
