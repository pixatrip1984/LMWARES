import type { Id, Timestamps } from '../common';

export const STARTER_CLIENT_PROJECT_STATUSES = ['provisioning', 'active', 'archived'] as const;
export type StarterClientProjectStatus = (typeof STARTER_CLIENT_PROJECT_STATUSES)[number];

/**
 * Client-owned Starter project/site identity: the slug and display name the
 * client's public site is known by. This is intentionally separate from
 * `LmwaresProject`, which is Oracle's internal development registry (repo,
 * branch, phases). `StarterWorkOrder.projectId` remains the optional link to
 * that internal registry and is never replaced by this record — an operator
 * can build and go live on the internal side while this record only tracks
 * the client-facing identity of the site.
 */
export interface StarterClientProject extends Timestamps {
  id: Id;
  workOrderId: Id;
  intakeId: Id;
  userId: Id;
  slug: string;
  siteName: string;
  status: StarterClientProjectStatus;
}
