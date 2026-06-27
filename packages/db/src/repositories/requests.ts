import type { D1Database } from '@cloudflare/workers-types';
import type {
  Paginated,
  PaginationParams,
  Request,
  RequestNote,
  RequestStatus,
} from '@starter/domain';
import { newId, nowIso, nullable } from '../helpers';
import { mapRequest, mapRequestNote } from '../mappers';
import type { RequestNoteRow, RequestRow } from '../rows';

export interface CreateRequestData {
  type: string;
  publicationId?: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  message?: string | null;
  payload: Record<string, unknown>;
  source?: string | null;
}

export interface ListRequestsFilters extends PaginationParams {
  status?: RequestStatus;
  type?: string;
}

export class RequestsRepository {
  constructor(private readonly db: D1Database) {}

  async create(data: CreateRequestData): Promise<Request> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO requests
          (id, type, status, publication_id, contact_name, contact_email, contact_phone, message, payload, source, created_at, updated_at)
         VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        data.type,
        nullable(data.publicationId),
        data.contactName,
        data.contactEmail,
        nullable(data.contactPhone),
        nullable(data.message),
        JSON.stringify(data.payload ?? {}),
        nullable(data.source),
        now,
        now,
      )
      .run();
    return (await this.getById(id))!;
  }

  async listAll(filters: ListRequestsFilters): Promise<Paginated<Request>> {
    const { page, pageSize, status, type } = filters;
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (type) {
      clauses.push('type = ?');
      params.push(type);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) AS c FROM requests ${where}`)
      .bind(...params)
      .first<{ c: number }>();
    const total = countRow?.c ?? 0;

    const { results } = await this.db
      .prepare(
        `SELECT * FROM requests ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...params, pageSize, (page - 1) * pageSize)
      .all<RequestRow>();

    return {
      items: results.map(mapRequest),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  async getById(id: string): Promise<Request | null> {
    const row = await this.db
      .prepare(`SELECT * FROM requests WHERE id = ?`)
      .bind(id)
      .first<RequestRow>();
    return row ? mapRequest(row) : null;
  }

  async setStatus(id: string, status: RequestStatus): Promise<Request | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    await this.db
      .prepare(`UPDATE requests SET status = ?, updated_at = ? WHERE id = ?`)
      .bind(status, nowIso(), id)
      .run();
    return this.getById(id);
  }

  // ── Notas ──────────────────────────────────────────────────
  async listNotes(requestId: string): Promise<RequestNote[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM request_notes WHERE request_id = ? ORDER BY created_at ASC`)
      .bind(requestId)
      .all<RequestNoteRow>();
    return results.map(mapRequestNote);
  }

  async addNote(data: {
    requestId: string;
    authorEmail: string;
    body: string;
  }): Promise<RequestNote> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO request_notes (id, request_id, author_email, body, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, data.requestId, data.authorEmail, data.body, now)
      .run();
    const row = await this.db
      .prepare(`SELECT * FROM request_notes WHERE id = ?`)
      .bind(id)
      .first<RequestNoteRow>();
    return mapRequestNote(row!);
  }
}
