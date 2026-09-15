import type { Id, IsoDateTime, Timestamps } from '../common';

export const COMMERCIAL_DEMO_LIFECYCLE_STATUSES = [
  'demo_preparing', 'demo_ready', 'phase_1_decision_pending', 'phase_1_payment_due', 'in_implementation',
  'client_review', 'ready_to_publish', 'live', 'canceled',
] as const;
export type CommercialDemoLifecycleStatus = (typeof COMMERCIAL_DEMO_LIFECYCLE_STATUSES)[number];

export const COMMERCIAL_DEMO_PHASE_STATUSES = [
  'locked', 'in_progress', 'payment_due', 'payment_confirmed', 'completed',
] as const;
export type CommercialDemoPhaseStatus = (typeof COMMERCIAL_DEMO_PHASE_STATUSES)[number];

export interface CommercialDemoLifecycle extends Timestamps {
  id: Id;
  intakeId: Id;
  commercialOfferId: Id;
  userId: Id;
  slug: string;
  siteName: string;
  status: CommercialDemoLifecycleStatus;
  demoAssetKey: string | null;
  demoReleaseId: Id | null;
  demoPublishedAt: IsoDateTime | null;
  phaseZeroCompletedAt: IsoDateTime | null;
  workOrderId: Id | null;
  oracleProjectId: Id | null;
}

export interface CommercialDemoPhase extends Timestamps {
  id: Id;
  lifecycleId: Id;
  phase: 0 | 1 | 2 | 3 | 4;
  status: CommercialDemoPhaseStatus;
  evidence: string | null;
  startedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  completedBy: string | null;
}
