import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';

export const COMMERCIAL_AGENT_JOB_TYPES = ['scope', 'demo'] as const;
export type CommercialAgentJobType = (typeof COMMERCIAL_AGENT_JOB_TYPES)[number];
export const COMMERCIAL_AGENT_JOB_STATUSES = ['queued', 'claimed', 'completed', 'failed'] as const;
export type CommercialAgentJobStatus = (typeof COMMERCIAL_AGENT_JOB_STATUSES)[number];

export interface CommercialAgentJob extends Timestamps {
  id: Id;
  intakeId: Id;
  lifecycleId: Id | null;
  jobType: CommercialAgentJobType;
  status: CommercialAgentJobStatus;
  attempt: number;
  maxAttempts: number;
  claimedBy: string | null;
  leaseUntil: IsoDateTime | null;
  leaseToken: string | null;
  executionGeneration: number;
  projectPath: string | null;
  result: Metadata | null;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: IsoDateTime | null;
}
