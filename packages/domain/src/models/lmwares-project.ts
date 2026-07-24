import type { Id, IsoDateTime, Metadata } from '../common';

export const LMWARES_PROJECT_HEALTH = ['on-track', 'needs-action', 'at-risk'] as const;
export type LmwaresProjectHealth = (typeof LMWARES_PROJECT_HEALTH)[number];

export const LMWARES_PROJECT_PRIORITIES = ['Alta', 'Media', 'Normal'] as const;
export type LmwaresProjectPriority = (typeof LMWARES_PROJECT_PRIORITIES)[number];

export const LMWARES_PHASE_STATUSES = [
  'completed',
  'active',
  'review',
  'locked',
  'blocked',
] as const;
export type LmwaresPhaseStatus = (typeof LMWARES_PHASE_STATUSES)[number];

export const LMWARES_PREVIEW_LAYOUTS = ['service', 'catalog', 'catalog-store', 'clinic'] as const;
export type LmwaresPreviewLayout = (typeof LMWARES_PREVIEW_LAYOUTS)[number];

export const LMWARES_SNAPSHOT_KINDS = ['scan', 'agent', 'preview', 'validation', 'manual'] as const;
export type LmwaresSnapshotKind = (typeof LMWARES_SNAPSHOT_KINDS)[number];

export const LMWARES_VALIDATION_KINDS = [
  'typecheck',
  'build',
  'tests',
  'workers-dry-run',
  'd1-migrations',
  'visual-qa',
  'security',
  'custom',
] as const;
export type LmwaresValidationKind = (typeof LMWARES_VALIDATION_KINDS)[number];

export const LMWARES_VALIDATION_STATUSES = ['passed', 'failed', 'blocked', 'skipped'] as const;
export type LmwaresValidationStatus = (typeof LMWARES_VALIDATION_STATUSES)[number];

export const LMWARES_APPROVAL_GATES = [
  'contract',
  'visual',
  'local-operation',
  'validation',
  'staging',
  'production',
] as const;
export type LmwaresApprovalGate = (typeof LMWARES_APPROVAL_GATES)[number];

export const LMWARES_APPROVAL_DECISIONS = ['approved', 'changes-requested', 'rejected'] as const;
export type LmwaresApprovalDecision = (typeof LMWARES_APPROVAL_DECISIONS)[number];

export interface LmwaresProjectPhase {
  id: string;
  label: string;
  status: LmwaresPhaseStatus;
  evidence: string;
  owner: string;
}

export interface LmwaresProjectPreview {
  title: string;
  subtitle: string;
  layout: LmwaresPreviewLayout;
  palette: string;
}

/** Proyecto privado descubierto por Oracle y persistido en el registro LMWARES. */
export interface LmwaresProject {
  id: string;
  name: string;
  business: string;
  category: string;
  statusLabel: string;
  phase: string;
  progress: number;
  priority: LmwaresProjectPriority;
  health: LmwaresProjectHealth;
  repo: string;
  branch: string;
  previewUrl: string;
  lastRefresh: string;
  developer: string;
  due: string;
  day: number;
  daysLeft: number;
  nextAction: string;
  seedPrompt: string;
  tags: string[];
  preview: LmwaresProjectPreview;
  phases: LmwaresProjectPhase[];
  registrySource: string;
  manifestPath: string | null;
  scanMetadata: Metadata;
  firstSeenAt: IsoDateTime;
  lastScannedAt: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Evidencia inmutable que Codex, un validador o el operador deja sobre un proyecto. */
export interface LmwaresProjectSnapshot {
  id: Id;
  projectId: string;
  kind: LmwaresSnapshotKind;
  label: string;
  summary: string | null;
  sourceRevision: string | null;
  previewUrl: string | null;
  artifactPath: string | null;
  metadata: Metadata;
  createdBy: string;
  createdAt: IsoDateTime;
}

/** Resultado append-only de un validador; registra evidencia, no ejecuta comandos. */
export interface LmwaresValidationResult {
  id: Id;
  projectId: string;
  snapshotId: Id | null;
  kind: LmwaresValidationKind;
  status: LmwaresValidationStatus;
  label: string;
  summary: string | null;
  sourceRevision: string | null;
  artifactPath: string | null;
  metadata: Metadata;
  createdBy: string;
  createdAt: IsoDateTime;
}

/** Decisión humana append-only sobre un gate; aprobar nunca ejecuta el despliegue. */
export interface LmwaresApproval {
  id: Id;
  projectId: string;
  snapshotId: Id | null;
  gate: LmwaresApprovalGate;
  decision: LmwaresApprovalDecision;
  comment: string | null;
  metadata: Metadata;
  decidedBy: string;
  createdAt: IsoDateTime;
}
