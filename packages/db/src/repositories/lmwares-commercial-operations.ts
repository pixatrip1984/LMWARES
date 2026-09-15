import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  type CommercialAssignmentRole,
  type CommercialOperation,
  type CommercialOperationOriginChannel,
  type CommercialOperationStatus,
  type CommercialPerson,
  type Metadata,
  type SalesActor,
} from '@starter/domain';
import { newId, nowIso, parseJson, parseMetadata } from '../helpers';

interface CommercialPersonRow {
  id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

interface SalesActorRow {
  id: string;
  access_subject: string | null;
  email_normalized: string;
  display_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface CommercialOperationRow {
  id: string;
  public_reference: string;
  origin_channel: string;
  status: string;
  primary_person_id: string | null;
  primary_business_id: string | null;
  created_by_actor_id: string | null;
  current_proposal_id: string | null;
  current_contract_id: string | null;
  workflow_version: number;
  draft_revision: number;
  row_version: number;
  requirement_brief: string;
  capability_policy_ref: string | null;
  created_at: string;
  updated_at: string;
  presented_at: string | null;
  accepted_at: string | null;
  closed_at: string | null;
}

/**
 * Raíz del dominio comercial nuevo. No emite ofertas ni acepta contratos:
 * esas transiciones llegarán en etapas posteriores y deberán usar esta misma
 * operación, venga del configurador, de Sales o de una creación interna.
 */
export class LmwaresCommercialOperationsRepository {
  constructor(private readonly db: D1Database) {}

  async syncSalesActor(input: {
    email: string;
    displayName: string;
    accessSubject?: string | null;
  }): Promise<SalesActor> {
    const email = normalizeEmail(input.email);
    const subject = input.accessSubject?.trim() || null;
    if (!email) throw new AppError('validation_error', 'El correo del vendedor es obligatorio.');

    if (subject) {
      const bySubject = await this.db
        .prepare('SELECT * FROM lmw_sales_actors WHERE access_subject = ? LIMIT 1')
        .bind(subject)
        .first<SalesActorRow>();
      if (bySubject && bySubject.email_normalized !== email) {
        throw new AppError('conflict', 'La identidad de Access ya pertenece a otro vendedor.');
      }
    }

    const existing = await this.db
      .prepare('SELECT * FROM lmw_sales_actors WHERE email_normalized = ? LIMIT 1')
      .bind(email)
      .first<SalesActorRow>();
    const now = nowIso();
    if (!existing) {
      const id = newId();
      await this.db
        .prepare(
          `INSERT INTO lmw_sales_actors
            (id, access_subject, email_normalized, display_name, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?)`,
        )
        .bind(id, subject, email, input.displayName.trim() || email, now, now)
        .run();
      return (await this.getSalesActorById(id))!;
    }

    await this.db
      .prepare(
        `UPDATE lmw_sales_actors
         SET access_subject = COALESCE(?, access_subject),
             display_name = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(subject, input.displayName.trim() || existing.display_name, now, existing.id)
      .run();
    return (await this.getSalesActorById(existing.id))!;
  }

  async getSalesActorById(id: string): Promise<SalesActor | null> {
    const row = await this.db
      .prepare('SELECT * FROM lmw_sales_actors WHERE id = ? LIMIT 1')
      .bind(id)
      .first<SalesActorRow>();
    return row ? mapSalesActor(row) : null;
  }

  async getSalesActorForAccess(input: { email: string; accessSubject?: string | null }): Promise<SalesActor | null> {
    const email = normalizeEmail(input.email);
    const subject = input.accessSubject?.trim() || null;
    const row = subject
      ? await this.db
          .prepare(
            `SELECT * FROM lmw_sales_actors
             WHERE access_subject = ? OR (access_subject IS NULL AND email_normalized = ?)
             LIMIT 1`,
          )
          .bind(subject, email)
          .first<SalesActorRow>()
      : await this.db
          .prepare('SELECT * FROM lmw_sales_actors WHERE email_normalized = ? LIMIT 1')
          .bind(email)
          .first<SalesActorRow>();
    if (!row) return null;
    if (row.status !== 'active') return mapSalesActor(row);
    if (subject && row.access_subject === null) {
      await this.db
        .prepare('UPDATE lmw_sales_actors SET access_subject = ?, updated_at = ? WHERE id = ? AND access_subject IS NULL')
        .bind(subject, nowIso(), row.id)
        .run();
      return (await this.getSalesActorById(row.id))!;
    }
    return mapSalesActor(row);
  }

  async listSalesActors(limit = 100): Promise<SalesActor[]> {
    const result = await this.db
      .prepare('SELECT * FROM lmw_sales_actors ORDER BY status ASC, created_at ASC LIMIT ?')
      .bind(Math.max(1, Math.min(100, Math.trunc(limit))))
      .all<SalesActorRow>();
    return result.results.map(mapSalesActor);
  }

  async setSalesActorStatus(input: { id: string; status: SalesActor['status'] }): Promise<SalesActor> {
    const result = await this.db
      .prepare('UPDATE lmw_sales_actors SET status = ?, updated_at = ? WHERE id = ?')
      .bind(input.status, nowIso(), input.id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) throw AppError.notFound('Vendedor');
    return (await this.getSalesActorById(input.id))!;
  }

  async createDraft(input: {
    originChannel: CommercialOperationOriginChannel;
    createdByActorId?: string | null;
    contact: { displayName: string; email: string };
    business?: { tradeName: string; legalName?: string | null } | null;
    requirementBrief?: Metadata;
    idempotency?: { actorScope: string; key: string; requestDigest: string } | null;
  }): Promise<CommercialOperation> {
    if (input.idempotency) {
      const replay = await this.findDraftReplay(input.idempotency);
      if (replay) return replay;
    }
    const now = nowIso();
    const personId = newId();
    const emailIdentityId = newId();
    const businessId = input.business ? newId() : null;
    const operationId = newId();
    const assignmentId = input.createdByActorId ? newId() : null;
    const eventId = newId();
    const publicReference = `OP-${operationId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const email = normalizeEmail(input.contact.email);
    const displayName = input.contact.displayName.trim();
    if (!email || !displayName) {
      throw new AppError('validation_error', 'El nombre y correo del contacto son obligatorios.');
    }
    if (input.createdByActorId) {
      const seller = await this.getSalesActorById(input.createdByActorId);
      if (!seller || seller.status !== 'active') throw new AppError('forbidden', 'El vendedor no está activo.');
    }

    const existingIdentity = await this.db
      .prepare('SELECT id FROM lmw_commercial_email_identities WHERE email_normalized = ? LIMIT 1')
      .bind(email)
      .first<{ id: string }>();
    const resolvedEmailIdentityId = existingIdentity?.id ?? emailIdentityId;
    const statements = [
      this.db
        .prepare(
          `INSERT INTO lmw_commercial_people (id, display_name, created_at, updated_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(personId, displayName, now, now),
      ...(existingIdentity
        ? []
        : [
            this.db
              .prepare(
                `INSERT INTO lmw_commercial_email_identities
                  (id, email_normalized, created_at, updated_at)
                 VALUES (?, ?, ?, ?)`,
              )
              .bind(emailIdentityId, email, now, now),
          ]),
      this.db
        .prepare(
          `INSERT INTO lmw_commercial_person_email_identities
            (person_id, email_identity_id, relationship, is_primary, created_at, updated_at)
           VALUES (?, ?, 'contact', 1, ?, ?)`,
        )
        .bind(personId, resolvedEmailIdentityId, now, now),
      ...(input.business
        ? [
            this.db
              .prepare(
                `INSERT INTO lmw_commercial_businesses
                  (id, legal_name, trade_name, country_code, status, created_at, updated_at)
                 VALUES (?, ?, ?, 'MX', 'active', ?, ?)`,
              )
              .bind(businessId, input.business.legalName?.trim() || null, input.business.tradeName.trim(), now, now),
            this.db
              .prepare(
                `INSERT INTO lmw_commercial_business_representatives
                  (business_id, person_id, role, active, created_at, updated_at)
                 VALUES (?, ?, 'primary_representative', 1, ?, ?)`,
              )
              .bind(businessId, personId, now, now),
          ]
        : []),
      this.db
        .prepare(
          `INSERT INTO lmw_commercial_operations
            (id, public_reference, origin_channel, status, primary_person_id, primary_business_id,
             created_by_actor_id, workflow_version, draft_revision, row_version, requirement_brief,
             created_at, updated_at)
           VALUES (?, ?, ?, 'draft', ?, ?, ?, 1, 1, 1, ?, ?, ?)`,
        )
        .bind(
          operationId,
          publicReference,
          input.originChannel,
          personId,
          businessId,
          input.createdByActorId ?? null,
          JSON.stringify(input.requirementBrief ?? {}),
          now,
          now,
        ),
      ...(assignmentId
        ? [
            this.db
              .prepare(
                `INSERT INTO lmw_commercial_operation_assignments
                  (id, operation_id, sales_actor_id, role, assigned_by_actor_id, started_at, created_at)
                 VALUES (?, ?, ?, 'originator', ?, ?, ?)`,
              )
              .bind(assignmentId, operationId, input.createdByActorId, input.createdByActorId, now, now),
          ]
        : []),
      this.db
        .prepare(
          `INSERT INTO lmw_commercial_operation_events
            (id, operation_id, event_type, actor_type, actor_id, dedupe_key, payload, created_at)
           VALUES (?, ?, 'commercial.operation.created', ?, ?, ?, ?, ?)`,
        )
        .bind(
          eventId,
          operationId,
          input.createdByActorId ? 'seller' : 'system',
          input.createdByActorId ?? null,
          `operation-created:${operationId}`,
          JSON.stringify({ originChannel: input.originChannel }),
          now,
        ),
      ...(input.idempotency
        ? [
            this.db
              .prepare(
                `INSERT INTO lmw_commercial_command_receipts
                  (id, actor_scope, command_type, idempotency_key, request_digest, response_snapshot, created_at)
                 VALUES (?, ?, 'commercial.operation.create_draft', ?, ?, ?, ?)`,
              )
              .bind(
                newId(),
                input.idempotency.actorScope,
                input.idempotency.key,
                input.idempotency.requestDigest,
                JSON.stringify({ operationId }),
                now,
              ),
          ]
        : []),
    ];
    try {
      await this.db.batch(statements);
    } catch (error) {
      if (input.idempotency) {
        const replay = await this.findDraftReplay(input.idempotency);
        if (replay) return replay;
      }
      throw error;
    }
    return (await this.getById(operationId))!;
  }

  async getById(id: string): Promise<CommercialOperation | null> {
    const row = await this.db
      .prepare('SELECT * FROM lmw_commercial_operations WHERE id = ? LIMIT 1')
      .bind(id)
      .first<CommercialOperationRow>();
    return row ? mapCommercialOperation(row) : null;
  }

  async getForSalesActor(operationId: string, salesActorId: string): Promise<CommercialOperation | null> {
    const row = await this.db
      .prepare(
        `SELECT o.* FROM lmw_commercial_operations o
         JOIN lmw_commercial_operation_assignments a ON a.operation_id = o.id
         WHERE o.id = ? AND a.sales_actor_id = ? AND a.ended_at IS NULL
         ORDER BY a.started_at DESC LIMIT 1`,
      )
      .bind(operationId, salesActorId)
      .first<CommercialOperationRow>();
    return row ? mapCommercialOperation(row) : null;
  }

  async updateDraftForSalesActor(input: {
    operationId: string;
    salesActorId: string;
    rowVersion: number;
    requirementBrief: Metadata;
  }): Promise<CommercialOperation> {
    const now = nowIso();
    const result = await this.db.prepare(
      `UPDATE lmw_commercial_operations
       SET requirement_brief = ?, draft_revision = draft_revision + 1,
           row_version = row_version + 1, updated_at = ?
       WHERE id = ? AND row_version = ?
         AND status IN ('draft', 'needs_scope', 'offer_ready')
         AND EXISTS (
           SELECT 1 FROM lmw_commercial_operation_assignments a
           WHERE a.operation_id = lmw_commercial_operations.id
             AND a.sales_actor_id = ? AND a.ended_at IS NULL
         )`,
    ).bind(JSON.stringify(input.requirementBrief), now, input.operationId, input.rowVersion, input.salesActorId).run();
    if ((result.meta.changes ?? 0) !== 1) {
      const current = await this.getForSalesActor(input.operationId, input.salesActorId);
      if (!current) throw AppError.notFound('Operación comercial');
      throw new AppError('conflict', 'La operación cambió en otro dispositivo. Recarga antes de guardar.');
    }
    return (await this.getById(input.operationId))!;
  }

  async saveScopeProposalForSalesActor(input: {
    expectedRowVersion: number;
    operationId: string; salesActorId: string; renderedDocument: string; documentDigest: string;
    scopeSnapshot: Metadata; pricingSnapshot: Metadata; termsSnapshot: Metadata; policySnapshot: Metadata;
  }): Promise<{ id: string; version: number; operation: CommercialOperation }> {
    const operation = await this.getForSalesActor(input.operationId, input.salesActorId);
    if (!operation) throw AppError.notFound('Operación comercial');
    if (operation.rowVersion !== input.expectedRowVersion) throw new AppError('conflict', 'La oportunidad cambió durante la generación. Recarga para revisar su versión actual.');
    if (!['draft', 'needs_scope', 'offer_ready'].includes(operation.status)) throw new AppError('conflict', 'La operación ya no admite un nuevo alcance.');
    const latest = await this.db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM lmw_commercial_proposals WHERE operation_id = ?').bind(operation.id).first<{ version: number }>();
    const proposalId = newId(); const now = nowIso(); const version = (latest?.version ?? 0) + 1;
    const result = await this.db.batch([
      this.db.prepare(`INSERT INTO lmw_commercial_proposals (id, operation_id, version, status, rendered_document, document_digest, scope_snapshot, pricing_snapshot, terms_snapshot, policy_snapshot, valid_until, created_by_actor_id, created_at, updated_at)
        SELECT ?, ?, ?, 'review_ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM lmw_commercial_operations o WHERE o.id = ? AND o.row_version = ? AND o.status IN ('draft', 'needs_scope', 'offer_ready'))
        AND EXISTS (SELECT 1 FROM lmw_commercial_operation_assignments a WHERE a.operation_id = ? AND a.sales_actor_id = ? AND a.ended_at IS NULL)`)
        .bind(proposalId, operation.id, version, input.renderedDocument, input.documentDigest, JSON.stringify(input.scopeSnapshot), JSON.stringify(input.pricingSnapshot), JSON.stringify(input.termsSnapshot), JSON.stringify(input.policySnapshot), new Date(Date.now() + 30 * 86400_000).toISOString(), input.salesActorId, now, now, operation.id, input.expectedRowVersion, operation.id, input.salesActorId),
      this.db.prepare(`UPDATE lmw_commercial_proposals SET status = 'superseded', updated_at = ? WHERE operation_id = ? AND id <> ? AND status IN ('draft', 'review_ready') AND EXISTS (SELECT 1 FROM lmw_commercial_proposals WHERE id = ?)`).bind(now, operation.id, proposalId, proposalId),
      this.db.prepare(`UPDATE lmw_commercial_operations SET status = 'offer_ready', current_proposal_id = ?, row_version = row_version + 1, updated_at = ? WHERE id = ? AND row_version = ? AND EXISTS (SELECT 1 FROM lmw_commercial_proposals WHERE id = ?)`).bind(proposalId, now, operation.id, input.expectedRowVersion, proposalId),
    ]);
    if ((result[2]?.meta.changes ?? 0) !== 1) throw new AppError('conflict', 'La operación cambió mientras se generaba el alcance.');
    return { id: proposalId, version, operation: (await this.getById(operation.id))! };
  }

  async getScopeForSalesActor(operationId: string, salesActorId: string) {
    const row = await this.db.prepare(`SELECT p.id, p.version, p.scope_snapshot FROM lmw_commercial_proposals p
      JOIN lmw_commercial_operations o ON o.current_proposal_id = p.id AND o.id = p.operation_id
      JOIN lmw_commercial_operation_assignments a ON a.operation_id = o.id
      WHERE o.id = ? AND a.sales_actor_id = ? AND a.ended_at IS NULL`).bind(operationId, salesActorId).first<{ id: string; version: number; scope_snapshot: string }>();
    return row ? { id: row.id, version: row.version, draft: JSON.parse(row.scope_snapshot) as Metadata } : null;
  }

  async listForSalesActor(salesActorId: string, limit = 50): Promise<CommercialOperation[]> {
    const result = await this.db
      .prepare(
        `SELECT o.* FROM lmw_commercial_operations o
         JOIN lmw_commercial_operation_assignments a ON a.operation_id = o.id
         WHERE a.sales_actor_id = ? AND a.ended_at IS NULL
         ORDER BY o.updated_at DESC LIMIT ?`,
      )
      .bind(salesActorId, Math.max(1, Math.min(100, Math.trunc(limit))))
      .all<CommercialOperationRow>();
    return result.results.map(mapCommercialOperation);
  }

  /** Solo pistas booleanas; los vendedores no reciben historial ni contratos ajenos. */
  async findDedupHints(input: { email?: string | null; businessName?: string | null }): Promise<{
    emailExists: boolean;
    businessExists: boolean;
  }> {
    const email = input.email ? normalizeEmail(input.email) : null;
    const businessName = input.businessName?.trim() || null;
    const [identity, business] = await this.db.batch([
      this.db
        .prepare('SELECT 1 AS found FROM lmw_commercial_email_identities WHERE email_normalized = ? LIMIT 1')
        .bind(email),
      this.db
        .prepare('SELECT 1 AS found FROM lmw_commercial_businesses WHERE lower(trade_name) = lower(?) LIMIT 1')
        .bind(businessName),
    ]);
    return {
      emailExists: (identity?.results?.length ?? 0) > 0,
      businessExists: (business?.results?.length ?? 0) > 0,
    };
  }

  private async findDraftReplay(input: { actorScope: string; key: string; requestDigest: string }): Promise<CommercialOperation | null> {
    const receipt = await this.db
      .prepare(
        `SELECT request_digest, response_snapshot FROM lmw_commercial_command_receipts
         WHERE actor_scope = ? AND command_type = 'commercial.operation.create_draft' AND idempotency_key = ? LIMIT 1`,
      )
      .bind(input.actorScope, input.key)
      .first<{ request_digest: string; response_snapshot: string }>();
    if (!receipt) return null;
    if (receipt.request_digest !== input.requestDigest) {
      throw new AppError('conflict', 'La clave de idempotencia ya se usó con otra solicitud.');
    }
    const snapshot = parseJson<{ operationId?: string }>(receipt.response_snapshot, {});
    if (!snapshot.operationId) throw new AppError('conflict', 'El recibo de la operación está incompleto.');
    const operation = await this.getById(snapshot.operationId);
    if (!operation) throw new AppError('conflict', 'La operación asociada al recibo ya no está disponible.');
    return operation;
  }
}

export function isCommercialOperationTransitionAllowed(
  from: CommercialOperationStatus,
  to: CommercialOperationStatus,
): boolean {
  const allowed: Partial<Record<CommercialOperationStatus, CommercialOperationStatus[]>> = {
    draft: ['needs_scope', 'lost', 'cancelled'],
    needs_scope: ['offer_ready', 'lost', 'cancelled', 'manual_hold'],
    offer_ready: ['presented', 'lost', 'cancelled', 'manual_hold'],
    presented: ['awaiting_identity', 'accepted', 'declined', 'expired', 'manual_hold'],
    awaiting_identity: ['accepted', 'declined', 'expired', 'manual_hold'],
    accepted: ['phase_zero_in_progress', 'cancelled', 'manual_hold'],
    phase_zero_in_progress: ['phase_zero_customer_review', 'manual_hold', 'cancelled'],
    phase_zero_customer_review: ['awaiting_continuation', 'manual_hold', 'cancelled'],
    awaiting_continuation: ['awaiting_payment', 'expired', 'manual_hold', 'cancelled'],
    awaiting_payment: ['implementation_in_progress', 'expired', 'manual_hold', 'cancelled'],
    implementation_in_progress: ['completed', 'manual_hold', 'cancelled'],
  };
  return allowed[from]?.includes(to) ?? false;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function mapSalesActor(row: SalesActorRow): SalesActor {
  return {
    id: row.id,
    accessSubject: row.access_subject,
    emailNormalized: row.email_normalized,
    displayName: row.display_name,
    status: row.status as SalesActor['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCommercialOperation(row: CommercialOperationRow): CommercialOperation {
  return {
    id: row.id,
    publicReference: row.public_reference,
    originChannel: row.origin_channel as CommercialOperationOriginChannel,
    status: row.status as CommercialOperationStatus,
    primaryPersonId: row.primary_person_id,
    primaryBusinessId: row.primary_business_id,
    createdByActorId: row.created_by_actor_id,
    currentProposalId: row.current_proposal_id,
    currentContractId: row.current_contract_id,
    workflowVersion: row.workflow_version,
    draftRevision: row.draft_revision,
    rowVersion: row.row_version,
    requirementBrief: parseMetadata(row.requirement_brief),
    capabilityPolicyRef: row.capability_policy_ref,
    presentedAt: row.presented_at,
    acceptedAt: row.accepted_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCommercialPerson(row: CommercialPersonRow): CommercialPerson {
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
