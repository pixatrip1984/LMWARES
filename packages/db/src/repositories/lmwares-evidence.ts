import type { D1Database } from '@cloudflare/workers-types';
import type {
  LmwaresApproval,
  LmwaresApprovalDecision,
  LmwaresApprovalGate,
  LmwaresValidationKind,
  LmwaresValidationResult,
  LmwaresValidationStatus,
  Metadata,
} from '@starter/domain';
import { newId, nowIso, nullable } from '../helpers';
import { mapLmwaresApproval, mapLmwaresValidationResult } from '../mappers';
import type { LmwaresApprovalRow, LmwaresValidationResultRow } from '../rows';

export interface CreateLmwaresValidationData {
  projectId: string;
  snapshotId?: string | null;
  kind: LmwaresValidationKind;
  status: LmwaresValidationStatus;
  label: string;
  summary?: string | null;
  sourceRevision?: string | null;
  artifactPath?: string | null;
  metadata?: Metadata;
  createdBy: string;
}

export interface CreateLmwaresApprovalData {
  projectId: string;
  snapshotId?: string | null;
  gate: LmwaresApprovalGate;
  decision: LmwaresApprovalDecision;
  comment?: string | null;
  metadata?: Metadata;
  decidedBy: string;
}

export class LmwaresValidationResultsRepository {
  constructor(private readonly db: D1Database) {}

  async listForProject(projectId: string, limit = 100): Promise<LmwaresValidationResult[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM lmwares_validation_results
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(projectId, limit)
      .all<LmwaresValidationResultRow>();
    return results.map(mapLmwaresValidationResult);
  }

  async create(data: CreateLmwaresValidationData): Promise<LmwaresValidationResult> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmwares_validation_results (
          id, project_id, snapshot_id, kind, status, label, summary,
          source_revision, artifact_path, metadata, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        data.projectId,
        nullable(data.snapshotId),
        data.kind,
        data.status,
        data.label,
        nullable(data.summary),
        nullable(data.sourceRevision),
        nullable(data.artifactPath),
        JSON.stringify(data.metadata ?? {}),
        data.createdBy,
        now,
      )
      .run();

    const row = await this.db
      .prepare(`SELECT * FROM lmwares_validation_results WHERE id = ?`)
      .bind(id)
      .first<LmwaresValidationResultRow>();
    if (!row) throw new Error('No se pudo leer la validación recién creada.');
    return mapLmwaresValidationResult(row);
  }
}

export class LmwaresApprovalsRepository {
  constructor(private readonly db: D1Database) {}

  async listForProject(projectId: string, limit = 100): Promise<LmwaresApproval[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM lmwares_approvals
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(projectId, limit)
      .all<LmwaresApprovalRow>();
    return results.map(mapLmwaresApproval);
  }

  async create(data: CreateLmwaresApprovalData): Promise<LmwaresApproval> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmwares_approvals (
          id, project_id, snapshot_id, gate, decision, comment, metadata, decided_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        data.projectId,
        nullable(data.snapshotId),
        data.gate,
        data.decision,
        nullable(data.comment),
        JSON.stringify(data.metadata ?? {}),
        data.decidedBy,
        now,
      )
      .run();

    const row = await this.db
      .prepare(`SELECT * FROM lmwares_approvals WHERE id = ?`)
      .bind(id)
      .first<LmwaresApprovalRow>();
    if (!row) throw new Error('No se pudo leer la aprobación recién creada.');
    return mapLmwaresApproval(row);
  }
}
