import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';

export const STARTER_WORK_ORDER_STATUSES = [
  'awaiting_provisioning',
  'in_build',
  'client_review',
  'ready_to_publish',
  'live',
  'canceled',
] as const;

export type StarterWorkOrderStatus = (typeof STARTER_WORK_ORDER_STATUSES)[number];

export interface StarterWorkOrder extends Timestamps {
  id: Id;
  billingOrderId: Id;
  intakeId: Id;
  commercialOfferId: Id;
  userId: Id;
  projectId: string | null;
  status: StarterWorkOrderStatus;
  workSnapshot: Metadata;
  assignedBy: string | null;
  assignedAt: IsoDateTime | null;
}
