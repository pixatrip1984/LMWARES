import { z } from 'zod';
import {
  LMWARES_PHASE_STATUSES,
  LMWARES_APPROVAL_DECISIONS,
  LMWARES_APPROVAL_GATES,
  LMWARES_PREVIEW_LAYOUTS,
  LMWARES_PROJECT_HEALTH,
  LMWARES_PROJECT_PRIORITIES,
  LMWARES_SNAPSHOT_KINDS,
  LMWARES_VALIDATION_KINDS,
  LMWARES_VALIDATION_STATUSES,
} from '@starter/domain';

const projectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    'Id de proyecto inválido (usa letras, números, punto, guion o guion bajo).',
  );

const localOrRemoteUrlSchema = z.union([
  z.literal(''),
  z.string().trim().max(1000).url('URL inválida.'),
]);

const boundedMetadataSchema = z.record(z.string(), z.unknown()).refine((value) => {
  try {
    return JSON.stringify(value).length <= 100_000;
  } catch {
    return false;
  }
}, 'Los metadatos exceden el tamaño permitido o no son serializables.');

export const lmwaresProjectPhaseSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  status: z.enum(LMWARES_PHASE_STATUSES),
  evidence: z.string().trim().max(4000),
  owner: z.string().trim().min(1).max(160),
});

export const lmwaresProjectPreviewSchema = z.object({
  title: z.string().trim().min(1).max(240),
  subtitle: z.string().trim().max(500),
  layout: z.enum(LMWARES_PREVIEW_LAYOUTS),
  palette: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido.'),
});

export const scannedLmwaresProjectSchema = z.object({
  id: projectIdSchema,
  name: z.string().trim().min(1).max(240),
  business: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(160),
  statusLabel: z.string().trim().min(1).max(240),
  phase: z.string().trim().min(1).max(240),
  progress: z.number().int().min(0).max(100),
  priority: z.enum(LMWARES_PROJECT_PRIORITIES),
  health: z.enum(LMWARES_PROJECT_HEALTH),
  repo: z.string().trim().min(1).max(1000),
  branch: z.string().trim().min(1).max(240),
  previewUrl: localOrRemoteUrlSchema,
  lastRefresh: z.string().trim().min(1).max(160),
  developer: z.string().trim().min(1).max(240),
  due: z.string().trim().min(1).max(240),
  day: z.number().int().min(1).max(9999),
  daysLeft: z.number().int().min(0).max(9999),
  nextAction: z.string().trim().min(1).max(4000),
  seedPrompt: z.string().trim().min(1).max(20_000),
  tags: z.array(z.string().trim().min(1).max(80)).max(20),
  preview: lmwaresProjectPreviewSchema,
  phases: z.array(lmwaresProjectPhaseSchema).min(1).max(20),
  lmwares: z.object({
    source: z.enum(['manifest', 'inferred']),
    manifestPath: z.string().trim().max(1000).nullable(),
    signals: boundedMetadataSchema,
    git: boundedMetadataSchema,
  }),
});
export type ScannedLmwaresProjectInput = z.infer<typeof scannedLmwaresProjectSchema>;

export const syncLmwaresProjectsSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  root: z.string().trim().min(1).max(1000),
  source: z.literal('local-scan'),
  projects: z.array(scannedLmwaresProjectSchema).min(1).max(250),
});
export type SyncLmwaresProjectsInput = z.infer<typeof syncLmwaresProjectsSchema>;

export const createLmwaresSnapshotSchema = z.object({
  kind: z.enum(LMWARES_SNAPSHOT_KINDS),
  label: z.string().trim().min(1).max(240),
  summary: z.string().trim().max(4000).nullish(),
  sourceRevision: z.string().trim().max(240).nullish(),
  previewUrl: localOrRemoteUrlSchema.nullish(),
  artifactPath: z.string().trim().max(1000).nullish(),
  metadata: boundedMetadataSchema.default({}),
});
export type CreateLmwaresSnapshotInput = z.infer<typeof createLmwaresSnapshotSchema>;

const snapshotIdSchema = z.string().uuid('Id de snapshot inválido.');

export const createLmwaresValidationSchema = z
  .object({
    snapshotId: snapshotIdSchema.nullish(),
    kind: z.enum(LMWARES_VALIDATION_KINDS),
    status: z.enum(LMWARES_VALIDATION_STATUSES),
    label: z.string().trim().min(1).max(240),
    summary: z.string().trim().max(4000).nullish(),
    sourceRevision: z.string().trim().max(240).nullish(),
    artifactPath: z.string().trim().max(1000).nullish(),
    metadata: boundedMetadataSchema.default({}),
  })
  .strict();
export type CreateLmwaresValidationInput = z.infer<typeof createLmwaresValidationSchema>;

export const createLmwaresApprovalSchema = z
  .object({
    snapshotId: snapshotIdSchema.nullish(),
    gate: z.enum(LMWARES_APPROVAL_GATES),
    decision: z.enum(LMWARES_APPROVAL_DECISIONS),
    comment: z.string().trim().max(4000).nullish(),
    metadata: boundedMetadataSchema.default({}),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.decision !== 'approved' && !input.comment) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'Explica por qué se rechaza o se solicitan cambios.',
      });
    }
    if (
      input.decision === 'approved' &&
      (input.gate === 'staging' || input.gate === 'production') &&
      !input.snapshotId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['snapshotId'],
        message: 'Una aprobación remota debe quedar vinculada a un snapshot exacto.',
      });
    }
    if (
      input.decision === 'approved' &&
      (input.gate === 'staging' || input.gate === 'production') &&
      !input.comment
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'Documenta el alcance de la aprobación remota.',
      });
    }
  });
export type CreateLmwaresApprovalInput = z.infer<typeof createLmwaresApprovalSchema>;
