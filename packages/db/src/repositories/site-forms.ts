import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { Metadata } from '@starter/domain';
import { newId, nowIso, nullable, parseJson } from '../helpers';

type SiteFormFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox';
type SiteFormRequestStatus = 'new' | 'in-progress' | 'responded' | 'closed' | 'spam';
type SiteFormAnswers = Record<string, string | boolean>;

interface SiteFormDefinition {
  schemaVersion: 1;
  title: string;
  description: string;
  submitLabel: string;
  successMessage: string;
  fields: Array<{
    id: string;
    type: SiteFormFieldType;
    label: string;
    required: boolean;
    placeholder?: string;
    helpText?: string;
    minLength?: number;
    maxLength?: number;
    options?: Array<{ value: string; label: string }>;
  }>;
}

interface SiteForm {
  id: string;
  projectId: string;
  draftDefinition: SiteFormDefinition;
  publishedDefinition: SiteFormDefinition | null;
  draftRevision: number;
  publishedRevision: number | null;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface PublicSiteForm {
  projectId: string;
  revision: number;
  publishedAt: string;
  definition: SiteFormDefinition;
}

interface SiteFormRequest {
  id: string;
  formId: string;
  projectId: string;
  formRevision: number;
  status: SiteFormRequestStatus;
  answers: SiteFormAnswers;
  definitionSnapshot: SiteFormDefinition;
  internalPayload: Metadata;
  submittedAt: string;
  updatedAt: string;
}

interface SiteFormRequestNote {
  id: string;
  requestId: string;
  authorEmail: string;
  body: string;
  createdAt: string;
}

interface SiteFormStatusHistory {
  id: string;
  requestId: string;
  fromStatus: SiteFormRequestStatus | null;
  toStatus: SiteFormRequestStatus;
  changedBy: string | null;
  reason: string | null;
  createdAt: string;
}

interface SiteFormRequestDetail {
  request: SiteFormRequest;
  notes: SiteFormRequestNote[];
  history: SiteFormStatusHistory[];
}

const DEFAULT_SITE_FORM_DEFINITION: SiteFormDefinition = {
  schemaVersion: 1,
  title: 'Cuéntanos sobre tu solicitud',
  description: 'Comparte tus datos y el contexto necesario para poder responderte.',
  submitLabel: 'Enviar solicitud',
  successMessage: 'Recibimos tu solicitud. Te contactaremos pronto.',
  fields: [
    {
      id: 'name',
      type: 'text',
      label: 'Nombre',
      required: true,
      placeholder: 'Tu nombre',
      maxLength: 120,
    },
    {
      id: 'email',
      type: 'email',
      label: 'Correo',
      required: true,
      placeholder: 'nombre@empresa.com',
      maxLength: 254,
    },
    {
      id: 'message',
      type: 'textarea',
      label: '¿En qué podemos ayudarte?',
      required: true,
      placeholder: 'Describe brevemente tu solicitud',
      maxLength: 2000,
    },
  ],
};

interface SiteFormRow {
  id: string;
  project_id: string;
  draft_definition: string;
  published_definition: string | null;
  draft_revision: number;
  published_revision: number | null;
  published_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

interface SiteFormRequestRow {
  id: string;
  form_id: string;
  project_id: string;
  form_revision: number;
  status: string;
  answers: string;
  definition_snapshot: string;
  internal_payload: string;
  submitted_at: string;
  updated_at: string;
}

interface SiteFormRequestNoteRow {
  id: string;
  request_id: string;
  author_email: string;
  body: string;
  created_at: string;
}

interface SiteFormStatusHistoryRow {
  id: string;
  request_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface PublishedSiteFormRecord extends PublicSiteForm {
  formId: string;
}

export interface SiteFormRequestPage {
  items: SiteFormRequest[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface CreateSiteFormRequestData {
  formId: string;
  projectId: string;
  formRevision: number;
  answers: SiteFormAnswers;
  definitionSnapshot: SiteFormDefinition;
  internalPayload?: Metadata;
  ip?: string | null;
  userAgent?: string | null;
}

export class SiteFormsRepository {
  constructor(private readonly db: D1Database) {}

  async projectExists(projectId: string): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT id FROM lmwares_projects WHERE id = ?`)
      .bind(projectId)
      .first<{ id: string }>();
    return row !== null;
  }

  async getByProjectId(projectId: string): Promise<SiteForm | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmwares_site_forms WHERE project_id = ?`)
      .bind(projectId)
      .first<SiteFormRow>();
    return row ? mapSiteForm(row) : null;
  }

  async ensureForProject(projectId: string, actorEmail: string): Promise<SiteForm | null> {
    if (!(await this.projectExists(projectId))) return null;

    const existing = await this.getByProjectId(projectId);
    if (existing) return existing;

    const id = newId();
    const now = nowIso();
    const result = await this.db
      .prepare(
        `INSERT INTO lmwares_site_forms (
          id, project_id, draft_definition, published_definition,
          draft_revision, published_revision, published_at,
          created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, 1, NULL, NULL, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO NOTHING`,
      )
      .bind(
        id,
        projectId,
        JSON.stringify(DEFAULT_SITE_FORM_DEFINITION),
        actorEmail,
        actorEmail,
        now,
        now,
      )
      .run();

    if ((result.meta.changes ?? 0) > 0) {
      await this.recordAudit({
        projectId,
        formId: id,
        actorType: 'admin',
        actorId: actorEmail,
        action: 'site_form.create',
        metadata: { draftRevision: 1 },
      });
    }

    return this.getByProjectId(projectId);
  }

  async saveDraft(
    projectId: string,
    definition: SiteFormDefinition,
    actorEmail: string,
  ): Promise<SiteForm | null> {
    const form = await this.ensureForProject(projectId, actorEmail);
    if (!form) return null;

    const now = nowIso();
    const nextRevision = form.draftRevision + 1;
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmwares_site_forms
           SET draft_definition = ?, draft_revision = ?, updated_by = ?, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(JSON.stringify(definition), nextRevision, actorEmail, now, form.id, projectId),
      this.auditStatement({
        projectId,
        formId: form.id,
        actorType: 'admin',
        actorId: actorEmail,
        action: 'site_form.draft.update',
        metadata: { fromRevision: form.draftRevision, toRevision: nextRevision },
        createdAt: now,
      }),
    ]);
    return this.getByProjectId(projectId);
  }

  async publish(projectId: string, actorEmail: string): Promise<SiteForm | null> {
    const form = await this.ensureForProject(projectId, actorEmail);
    if (!form) return null;

    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmwares_site_forms
           SET published_definition = draft_definition,
               published_revision = draft_revision,
               published_at = ?,
               updated_by = ?,
               updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(now, actorEmail, now, form.id, projectId),
      this.auditStatement({
        projectId,
        formId: form.id,
        actorType: 'admin',
        actorId: actorEmail,
        action: 'site_form.publish',
        metadata: { revision: form.draftRevision },
        createdAt: now,
      }),
    ]);
    return this.getByProjectId(projectId);
  }

  async getPublishedForProject(projectId: string): Promise<PublishedSiteFormRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, project_id, published_definition, published_revision, published_at
         FROM lmwares_site_forms
         WHERE project_id = ?
           AND published_definition IS NOT NULL
           AND published_revision IS NOT NULL
           AND published_at IS NOT NULL`,
      )
      .bind(projectId)
      .first<
        Pick<
          SiteFormRow,
          'id' | 'project_id' | 'published_definition' | 'published_revision' | 'published_at'
        >
      >();

    if (
      !row ||
      row.published_definition === null ||
      row.published_revision === null ||
      row.published_at === null
    ) {
      return null;
    }

    return {
      formId: row.id,
      projectId: row.project_id,
      revision: row.published_revision,
      publishedAt: row.published_at,
      definition: parseRequiredJson<SiteFormDefinition>(
        row.published_definition,
        'definición publicada',
      ),
    };
  }

  async createRequest(data: CreateSiteFormRequestData): Promise<SiteFormRequest> {
    const id = newId();
    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO lmwares_site_form_requests (
            id, form_id, project_id, form_revision, status, answers,
            definition_snapshot, internal_payload, submitted_at, updated_at
          ) VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          data.formId,
          data.projectId,
          data.formRevision,
          JSON.stringify(data.answers),
          JSON.stringify(data.definitionSnapshot),
          JSON.stringify(data.internalPayload ?? {}),
          now,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO lmwares_site_form_status_history (
            id, request_id, from_status, to_status, changed_by, reason, created_at
          ) VALUES (?, ?, NULL, 'new', NULL, 'Solicitud pública recibida', ?)`,
        )
        .bind(newId(), id, now),
      this.auditStatement({
        projectId: data.projectId,
        formId: data.formId,
        requestId: id,
        actorType: 'public',
        action: 'site_form.request.create',
        metadata: { formRevision: data.formRevision },
        ip: data.ip,
        userAgent: data.userAgent,
        createdAt: now,
      }),
    ]);

    const request = await this.getRequestById(data.projectId, id);
    if (!request) throw new Error('No se pudo leer la solicitud recién creada.');
    return request;
  }

  async listRequests(
    projectId: string,
    filters: { page: number; pageSize: number; status?: SiteFormRequestStatus },
  ): Promise<SiteFormRequestPage> {
    const clauses = ['project_id = ?'];
    const params: unknown[] = [projectId];
    if (filters.status) {
      clauses.push('status = ?');
      params.push(filters.status);
    }
    const where = clauses.join(' AND ');

    const count = await this.db
      .prepare(`SELECT COUNT(*) AS total FROM lmwares_site_form_requests WHERE ${where}`)
      .bind(...params)
      .first<{ total: number }>();
    const total = count?.total ?? 0;

    const { results } = await this.db
      .prepare(
        `SELECT * FROM lmwares_site_form_requests
         WHERE ${where}
         ORDER BY submitted_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...params, filters.pageSize, (filters.page - 1) * filters.pageSize)
      .all<SiteFormRequestRow>();

    return {
      items: results.map(mapSiteFormRequest),
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      hasMore: filters.page * filters.pageSize < total,
    };
  }

  async getRequestById(projectId: string, requestId: string): Promise<SiteFormRequest | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM lmwares_site_form_requests
         WHERE id = ? AND project_id = ?`,
      )
      .bind(requestId, projectId)
      .first<SiteFormRequestRow>();
    return row ? mapSiteFormRequest(row) : null;
  }

  async getRequestDetail(
    projectId: string,
    requestId: string,
  ): Promise<SiteFormRequestDetail | null> {
    const request = await this.getRequestById(projectId, requestId);
    if (!request) return null;
    const [notes, history] = await Promise.all([
      this.listNotes(projectId, requestId),
      this.listHistory(projectId, requestId),
    ]);
    return { request, notes, history };
  }

  async setRequestStatus(data: {
    projectId: string;
    requestId: string;
    status: SiteFormRequestStatus;
    changedBy: string;
    reason?: string | null;
  }): Promise<SiteFormRequest | null> {
    const existing = await this.getRequestById(data.projectId, data.requestId);
    if (!existing) return null;
    if (existing.status === data.status) return existing;

    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmwares_site_form_requests
           SET status = ?, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(data.status, now, data.requestId, data.projectId),
      this.db
        .prepare(
          `INSERT INTO lmwares_site_form_status_history (
            id, request_id, from_status, to_status, changed_by, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          data.requestId,
          existing.status,
          data.status,
          data.changedBy,
          nullable(data.reason),
          now,
        ),
      this.auditStatement({
        projectId: data.projectId,
        formId: existing.formId,
        requestId: data.requestId,
        actorType: 'admin',
        actorId: data.changedBy,
        action: 'site_form.request.status',
        metadata: { from: existing.status, to: data.status },
        createdAt: now,
      }),
    ]);
    return this.getRequestById(data.projectId, data.requestId);
  }

  async addRequestNote(data: {
    projectId: string;
    requestId: string;
    authorEmail: string;
    body: string;
  }): Promise<SiteFormRequestNote | null> {
    const request = await this.getRequestById(data.projectId, data.requestId);
    if (!request) return null;

    const id = newId();
    const now = nowIso();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO lmwares_site_form_request_notes (
            id, request_id, author_email, body, created_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(id, data.requestId, data.authorEmail, data.body, now),
      this.auditStatement({
        projectId: data.projectId,
        formId: request.formId,
        requestId: data.requestId,
        actorType: 'admin',
        actorId: data.authorEmail,
        action: 'site_form.request.note.add',
        metadata: { noteId: id },
        createdAt: now,
      }),
    ]);

    const row = await this.db
      .prepare(`SELECT * FROM lmwares_site_form_request_notes WHERE id = ?`)
      .bind(id)
      .first<SiteFormRequestNoteRow>();
    return row ? mapSiteFormRequestNote(row) : null;
  }

  private async listNotes(projectId: string, requestId: string): Promise<SiteFormRequestNote[]> {
    const { results } = await this.db
      .prepare(
        `SELECT note.*
         FROM lmwares_site_form_request_notes note
         INNER JOIN lmwares_site_form_requests request
           ON request.id = note.request_id
         WHERE note.request_id = ? AND request.project_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(requestId, projectId)
      .all<SiteFormRequestNoteRow>();
    return results.map(mapSiteFormRequestNote);
  }

  private async listHistory(
    projectId: string,
    requestId: string,
  ): Promise<SiteFormStatusHistory[]> {
    const { results } = await this.db
      .prepare(
        `SELECT history.*
         FROM lmwares_site_form_status_history history
         INNER JOIN lmwares_site_form_requests request
           ON request.id = history.request_id
         WHERE history.request_id = ? AND request.project_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(requestId, projectId)
      .all<SiteFormStatusHistoryRow>();
    return results.map(mapSiteFormStatusHistory);
  }

  private async recordAudit(data: AuditStatementData): Promise<void> {
    await this.auditStatement(data).run();
  }

  private auditStatement(data: AuditStatementData): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO lmwares_site_form_audit_events (
          id, project_id, form_id, request_id, actor_type, actor_id,
          action, metadata, ip, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId(),
        data.projectId,
        nullable(data.formId),
        nullable(data.requestId),
        data.actorType,
        nullable(data.actorId),
        data.action,
        JSON.stringify(data.metadata ?? {}),
        nullable(data.ip),
        nullable(data.userAgent),
        data.createdAt ?? nowIso(),
      );
  }
}

interface AuditStatementData {
  projectId: string;
  formId?: string | null;
  requestId?: string | null;
  actorType: 'public' | 'admin' | 'system';
  actorId?: string | null;
  action: string;
  metadata?: Metadata;
  ip?: string | null;
  userAgent?: string | null;
  createdAt?: string;
}

function mapSiteForm(row: SiteFormRow): SiteForm {
  return {
    id: row.id,
    projectId: row.project_id,
    draftDefinition: parseRequiredJson<SiteFormDefinition>(
      row.draft_definition,
      'borrador del formulario',
    ),
    publishedDefinition: row.published_definition
      ? parseRequiredJson<SiteFormDefinition>(row.published_definition, 'definición publicada')
      : null,
    draftRevision: row.draft_revision,
    publishedRevision: row.published_revision,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSiteFormRequest(row: SiteFormRequestRow): SiteFormRequest {
  return {
    id: row.id,
    formId: row.form_id,
    projectId: row.project_id,
    formRevision: row.form_revision,
    status: row.status as SiteFormRequestStatus,
    answers: parseRequiredJson<SiteFormAnswers>(row.answers, 'respuestas'),
    definitionSnapshot: parseRequiredJson<SiteFormDefinition>(
      row.definition_snapshot,
      'snapshot del formulario',
    ),
    internalPayload: parseJson<Metadata>(row.internal_payload, {}),
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

function mapSiteFormRequestNote(row: SiteFormRequestNoteRow): SiteFormRequestNote {
  return {
    id: row.id,
    requestId: row.request_id,
    authorEmail: row.author_email,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapSiteFormStatusHistory(row: SiteFormStatusHistoryRow): SiteFormStatusHistory {
  return {
    id: row.id,
    requestId: row.request_id,
    fromStatus: row.from_status as SiteFormRequestStatus | null,
    toStatus: row.to_status as SiteFormRequestStatus,
    changedBy: row.changed_by,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function parseRequiredJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`JSON inválido en ${label}.`);
  }
}
