import type { D1Database } from '@cloudflare/workers-types';
import type {
  ActorType,
  AuditEvent,
  EntityType,
  StatusHistory,
} from '@starter/domain';
import { newId, nowIso, nullable } from '../helpers';
import { mapAuditEvent, mapStatusHistory } from '../mappers';
import type { AuditEventRow, StatusHistoryRow } from '../rows';

export interface RecordStatusChangeData {
  entityType: EntityType;
  entityId: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy?: string | null;
  reason?: string | null;
}

export interface RecordAuditData {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType?: EntityType | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export class StatusHistoryRepository {
  constructor(private readonly db: D1Database) {}

  async record(data: RecordStatusChangeData): Promise<StatusHistory> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO status_history
          (id, entity_type, entity_id, from_status, to_status, changed_by, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        data.entityType,
        data.entityId,
        nullable(data.fromStatus),
        data.toStatus,
        nullable(data.changedBy),
        nullable(data.reason),
        now,
      )
      .run();
    const row = await this.db
      .prepare(`SELECT * FROM status_history WHERE id = ?`)
      .bind(id)
      .first<StatusHistoryRow>();
    return mapStatusHistory(row!);
  }

  async listForEntity(entityType: EntityType, entityId: string): Promise<StatusHistory[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM status_history WHERE entity_type = ? AND entity_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(entityType, entityId)
      .all<StatusHistoryRow>();
    return results.map(mapStatusHistory);
  }
}

export class AuditRepository {
  constructor(private readonly db: D1Database) {}

  /** Registro append-only. No lanza si falla: la auditoría no debe romper la operación. */
  async record(data: RecordAuditData): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO audit_events
            (id, actor_type, actor_id, action, entity_type, entity_id, metadata, ip, user_agent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          data.actorType,
          nullable(data.actorId),
          data.action,
          nullable(data.entityType),
          nullable(data.entityId),
          JSON.stringify(data.metadata ?? {}),
          nullable(data.ip),
          nullable(data.userAgent),
          nowIso(),
        )
        .run();
    } catch (err) {
      console.error('audit.record failed', err);
    }
  }

  async listRecent(limit = 100): Promise<AuditEvent[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?`)
      .bind(limit)
      .all<AuditEventRow>();
    return results.map(mapAuditEvent);
  }
}
