import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  type ClientCustomDomain,
  type CustomDomainCertificateStatus,
  type CustomDomainStatus,
  type CustomDomainType,
  type CustomDomainVerificationMethod,
  type DomainProviderDnsInstruction,
} from '@starter/domain';
import { newId, nowIso, parseJson } from '../helpers';

interface CustomDomainRow {
  id: string;
  client_project_id: string;
  user_id: string;
  hostname: string;
  type: string;
  status: string;
  verification_method: string;
  verification_token_hash: string;
  dns_instructions: string;
  provider: string | null;
  external_id: string | null;
  certificate_status: string;
  last_error: string | null;
  registrar: string | null;
  registrar_order_id: string | null;
  verified_at: string | null;
  activated_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

type StoredCustomDomain = ClientCustomDomain & {
  verificationTokenHash: string;
};

export class LmwaresCustomDomainsRepository {
  constructor(private readonly db: D1Database) {}

  async getById(id: string): Promise<ClientCustomDomain | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_custom_domains WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<CustomDomainRow>();
    return row ? mapCustomDomain(row) : null;
  }

  async getByHostname(hostname: string): Promise<ClientCustomDomain | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM lmw_custom_domains
         WHERE hostname = ?
         ORDER BY CASE WHEN status = 'removed' THEN 1 ELSE 0 END, created_at DESC
         LIMIT 1`,
      )
      .bind(hostname)
      .first<CustomDomainRow>();
    return row ? mapCustomDomain(row) : null;
  }

  async getActiveByHostname(hostname: string): Promise<ClientCustomDomain | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM lmw_custom_domains
         WHERE hostname = ? AND status = 'active'
         LIMIT 1`,
      )
      .bind(hostname)
      .first<CustomDomainRow>();
    return row ? mapCustomDomain(row) : null;
  }

  async listForUser(userId: string): Promise<ClientCustomDomain[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM lmw_custom_domains
         WHERE user_id = ?
         ORDER BY created_at DESC`,
      )
      .bind(userId)
      .all<CustomDomainRow>();
    return result.results.map(mapCustomDomain);
  }

  async listForAdmin(clientProjectId?: string): Promise<ClientCustomDomain[]> {
    const result = clientProjectId
      ? await this.db
          .prepare(
            `SELECT * FROM lmw_custom_domains
             WHERE client_project_id = ?
             ORDER BY created_at DESC`,
          )
          .bind(clientProjectId)
          .all<CustomDomainRow>()
      : await this.db
          .prepare(`SELECT * FROM lmw_custom_domains ORDER BY created_at DESC`)
          .all<CustomDomainRow>();
    return result.results.map(mapCustomDomain);
  }

  async listForClientProject(input: {
    clientProjectId: string;
    userId: string;
  }): Promise<ClientCustomDomain[]> {
    const project = await this.getOwnedProject(input.clientProjectId, input.userId);
    if (!project) throw AppError.notFound('Proyecto Starter');
    const result = await this.db
      .prepare(
        `SELECT * FROM lmw_custom_domains
         WHERE client_project_id = ? AND user_id = ?
         ORDER BY created_at DESC`,
      )
      .bind(input.clientProjectId, input.userId)
      .all<CustomDomainRow>();
    return result.results.map(mapCustomDomain);
  }

  /**
   * Crea un registro pendiente después de que un DomainProvider haya generado
   * sus instrucciones. El token sólo se guarda como hash; el valor original
   * permanece en la respuesta de la operación que creó el registro.
   */
  async createPending(input: {
    clientProjectId: string;
    userId: string;
    hostname: string;
    type: CustomDomainType;
    verificationMethod: CustomDomainVerificationMethod;
    verificationTokenHash: string;
    dnsInstructions: DomainProviderDnsInstruction[];
    provider: string;
    externalId: string | null;
    registrar?: string | null;
    registrarOrderId?: string | null;
  }): Promise<ClientCustomDomain> {
    return (await this.createPendingWithResult(input)).domain;
  }

  async createPendingWithResult(input: {
    clientProjectId: string;
    userId: string;
    hostname: string;
    type: CustomDomainType;
    verificationMethod: CustomDomainVerificationMethod;
    verificationTokenHash: string;
    dnsInstructions: DomainProviderDnsInstruction[];
    provider: string;
    externalId: string | null;
    /**
     * Poblados sólo cuando el hostname se compró vía un DomainRegistrar
     * (ej. Namesilo) en el mismo flujo que crea este registro.
     */
    registrar?: string | null;
    registrarOrderId?: string | null;
  }): Promise<{ domain: ClientCustomDomain; created: boolean }> {
    const project = await this.getOwnedProject(input.clientProjectId, input.userId);
    if (!project) throw AppError.notFound('Proyecto Starter');

    const currentType = await this.db
      .prepare(
        `SELECT * FROM lmw_custom_domains
         WHERE client_project_id = ? AND type = ? AND status <> 'removed'
         LIMIT 1`,
      )
      .bind(input.clientProjectId, input.type)
      .first<CustomDomainRow>();
    if (currentType) {
      if (currentType.hostname === input.hostname) {
        return { domain: mapCustomDomain(currentType), created: false };
      }
      throw new AppError(
        'conflict',
        `El proyecto ya tiene un dominio ${input.type} pendiente o activo.`,
      );
    }

    const now = nowIso();
    const id = newId();
    try {
      await this.db
        .prepare(
          `INSERT INTO lmw_custom_domains
            (id, client_project_id, user_id, hostname, type, status,
             verification_method, verification_token_hash, dns_instructions,
             provider, external_id, certificate_status, registrar, registrar_order_id,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'pending_verification', ?, ?, ?, ?, ?, 'not_requested', ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.clientProjectId,
          input.userId,
          input.hostname,
          input.type,
          input.verificationMethod,
          input.verificationTokenHash,
          JSON.stringify(redactVerificationInstructions(input.dnsInstructions)),
          input.provider,
          input.externalId,
          input.registrar ?? null,
          input.registrarOrderId ?? null,
          now,
          now,
        )
        .run();
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const existing = await this.getByHostname(input.hostname);
      if (existing?.clientProjectId === input.clientProjectId && existing.type === input.type) {
        return { domain: existing, created: false };
      }
      throw new AppError('conflict', 'Ese hostname ya está asociado a otro proyecto.');
    }
    return { domain: (await this.getById(id))!, created: true };
  }

  async verify(input: {
    id: string;
    userId: string;
    verificationTokenHash: string;
  }): Promise<ClientCustomDomain> {
    const current = await this.getOwnedRecord(input.id, input.userId);
    if (!current) throw AppError.notFound('Dominio personalizado');
    if (current.status === 'removed') {
      throw new AppError('conflict', 'El dominio ya fue retirado.');
    }
    if (
      current.status === 'verified' ||
      current.status === 'provisioning' ||
      current.status === 'active'
    ) {
      return toPublicDomain(current);
    }
    if (current.verificationTokenHash !== input.verificationTokenHash) {
      throw new AppError('validation_error', 'El token de verificación no coincide.');
    }
    const now = nowIso();
    const result = await this.db
      .prepare(
        `UPDATE lmw_custom_domains
         SET status = 'verified', verified_at = COALESCE(verified_at, ?),
             last_error = NULL, updated_at = ?
         WHERE id = ? AND user_id = ? AND status IN ('draft', 'pending_verification', 'failed')`,
      )
      .bind(now, now, input.id, input.userId)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      const updated = await this.getOwned(input.id, input.userId);
      if (!updated) throw AppError.notFound('Dominio personalizado');
      return updated;
    }
    return (await this.getById(input.id))!;
  }

  async confirmVerifiedByAdmin(id: string): Promise<ClientCustomDomain> {
    const current = await this.getById(id);
    if (!current) throw AppError.notFound('Dominio personalizado');
    if (current.status === 'removed') {
      throw new AppError('conflict', 'El dominio ya fue retirado.');
    }
    if (current.status === 'verified' || current.status === 'provisioning' || current.status === 'active') {
      return current;
    }
    const now = nowIso();
    const result = await this.db
      .prepare(
        `UPDATE lmw_custom_domains
         SET status = 'verified', verified_at = COALESCE(verified_at, ?),
             last_error = NULL, updated_at = ?
         WHERE id = ? AND status IN ('draft', 'pending_verification', 'failed')`,
      )
      .bind(now, now, id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AppError('conflict', 'El dominio cambió mientras se confirmaba.');
    }
    return (await this.getById(id))!;
  }

  async saveProviderStatus(input: {
    id: string;
    status: Exclude<CustomDomainStatus, 'draft' | 'removed'>;
    certificateStatus: CustomDomainCertificateStatus;
    externalId: string | null;
    error: string | null;
  }): Promise<ClientCustomDomain> {
    const current = await this.getById(input.id);
    if (!current) throw AppError.notFound('Dominio personalizado');
    if (current.status === 'removed') {
      throw new AppError('conflict', 'El dominio ya fue retirado.');
    }
    const now = nowIso();
    const result = await this.db
      .prepare(
        `UPDATE lmw_custom_domains
         SET status = ?, certificate_status = ?, external_id = ?,
             last_error = ?, activated_at = CASE WHEN ? = 'active' THEN COALESCE(activated_at, ?) ELSE activated_at END,
             updated_at = ?
         WHERE id = ? AND status <> 'removed'`,
      )
      .bind(
        input.status,
        input.certificateStatus,
        input.externalId,
        input.error,
        input.status,
        now,
        now,
        input.id,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AppError('conflict', 'El dominio cambió mientras se actualizaba.');
    }
    return (await this.getById(input.id))!;
  }

  async remove(input: { id: string; userId: string }): Promise<ClientCustomDomain> {
    const current = await this.getOwned(input.id, input.userId);
    if (!current) throw AppError.notFound('Dominio personalizado');
    if (current.status === 'removed') return current;
    const now = nowIso();
    const result = await this.db
      .prepare(
        `UPDATE lmw_custom_domains
         SET status = 'removed', removed_at = COALESCE(removed_at, ?),
             updated_at = ?
         WHERE id = ? AND user_id = ? AND status <> 'removed'`,
      )
      .bind(now, now, input.id, input.userId)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AppError('conflict', 'El dominio cambió mientras se retiraba.');
    }
    return (await this.getById(input.id))!;
  }

  private async getOwned(id: string, userId: string): Promise<ClientCustomDomain | null> {
    const record = await this.getOwnedRecord(id, userId);
    return record ? toPublicDomain(record) : null;
  }

  private async getOwnedRecord(id: string, userId: string): Promise<StoredCustomDomain | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_custom_domains WHERE id = ? AND user_id = ? LIMIT 1`)
      .bind(id, userId)
      .first<CustomDomainRow>();
    return row ? mapStoredDomain(row) : null;
  }

  private async getOwnedProject(
    clientProjectId: string,
    userId: string,
  ): Promise<{ id: string } | null> {
    return this.db
      .prepare(
        `SELECT id FROM lmw_starter_client_projects
         WHERE id = ? AND user_id = ? AND status <> 'archived'
         LIMIT 1`,
      )
      .bind(clientProjectId, userId)
      .first<{ id: string }>();
  }
}

function mapCustomDomain(row: CustomDomainRow): ClientCustomDomain {
  return toPublicDomain(mapStoredDomain(row));
}

function mapStoredDomain(row: CustomDomainRow): StoredCustomDomain {
  return {
    id: row.id,
    clientProjectId: row.client_project_id,
    userId: row.user_id,
    hostname: row.hostname,
    type: row.type as CustomDomainType,
    status: row.status as CustomDomainStatus,
    verificationMethod: row.verification_method as CustomDomainVerificationMethod,
    verificationTokenHash: row.verification_token_hash,
    dnsInstructions: parseJson<DomainProviderDnsInstruction[]>(row.dns_instructions, []),
    provider: row.provider,
    externalId: row.external_id,
    certificateStatus: row.certificate_status as CustomDomainCertificateStatus,
    lastError: row.last_error,
    registrar: row.registrar,
    registrarOrderId: row.registrar_order_id,
    verifiedAt: row.verified_at,
    activatedAt: row.activated_at,
    removedAt: row.removed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicDomain(domain: StoredCustomDomain): ClientCustomDomain {
  const { verificationTokenHash: _verificationTokenHash, ...publicDomain } = domain;
  return publicDomain;
}

function redactVerificationInstructions(
  instructions: DomainProviderDnsInstruction[],
): DomainProviderDnsInstruction[] {
  return instructions.map((instruction) =>
    instruction.type === 'TXT'
      ? { ...instruction, value: 'lmwares-domain-verification=<token>' }
      : instruction,
  );
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}
