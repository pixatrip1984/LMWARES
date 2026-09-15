import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';

/** El canal describe cómo nació una operación; no cambia su contrato ni proyecto. */
export const COMMERCIAL_OPERATION_ORIGIN_CHANNELS = [
  'self_service',
  'seller_assisted',
  'internal',
] as const;

export type CommercialOperationOriginChannel =
  (typeof COMMERCIAL_OPERATION_ORIGIN_CHANNELS)[number];

export const COMMERCIAL_OPERATION_STATUSES = [
  'draft',
  'needs_scope',
  'offer_ready',
  'presented',
  'awaiting_identity',
  'accepted',
  'phase_zero_in_progress',
  'phase_zero_customer_review',
  'awaiting_continuation',
  'awaiting_payment',
  'implementation_in_progress',
  'completed',
  'declined',
  'lost',
  'cancelled',
  'expired',
  'manual_hold',
] as const;

export type CommercialOperationStatus = (typeof COMMERCIAL_OPERATION_STATUSES)[number];

export const COMMERCIAL_ASSIGNMENT_ROLES = [
  'originator',
  'owner',
  'closer',
  'participant',
] as const;

export type CommercialAssignmentRole = (typeof COMMERCIAL_ASSIGNMENT_ROLES)[number];

export interface CommercialPerson extends Timestamps {
  id: Id;
  displayName: string;
}

export interface CommercialEmailIdentity extends Timestamps {
  id: Id;
  emailNormalized: string;
  /** El usuario de LMWares se enlaza solo después de una verificación válida. */
  verifiedUserId: Id | null;
  verifiedAt: IsoDateTime | null;
}

export interface CommercialBusiness extends Timestamps {
  id: Id;
  legalName: string | null;
  tradeName: string;
  countryCode: string;
  taxIdentifier: string | null;
  status: 'active' | 'archived';
}

export interface SalesActor extends Timestamps {
  id: Id;
  /** `sub` de Access si el proveedor lo expone; email no es el identificador final. */
  accessSubject: string | null;
  emailNormalized: string;
  displayName: string;
  status: 'active' | 'suspended' | 'revoked';
}

export interface CommercialOperation extends Timestamps {
  id: Id;
  publicReference: string;
  originChannel: CommercialOperationOriginChannel;
  status: CommercialOperationStatus;
  primaryPersonId: Id | null;
  primaryBusinessId: Id | null;
  createdByActorId: Id | null;
  currentProposalId: Id | null;
  currentContractId: Id | null;
  workflowVersion: number;
  draftRevision: number;
  rowVersion: number;
  requirementBrief: Metadata;
  capabilityPolicyRef: string | null;
  presentedAt: IsoDateTime | null;
  acceptedAt: IsoDateTime | null;
  closedAt: IsoDateTime | null;
}

export interface CommercialOperationAssignment {
  id: Id;
  operationId: Id;
  salesActorId: Id;
  role: CommercialAssignmentRole;
  assignedByActorId: Id | null;
  assignmentReason: string | null;
  startedAt: IsoDateTime;
  endedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}
