import type { D1Database } from '@cloudflare/workers-types';
import { AppError, type CommercialDemoBuildSpec, type DemoBuildSpecV1 } from '@starter/domain';
import { newId, nowIso } from '../helpers';

type Row = {
  id: string; lifecycle_id: string; intake_id: string; accepted_offer_id: string;
  revision: number; schema_version: string; spec_json: string; spec_digest: string;
  created_at: string; updated_at: string;
};

export class LmwaresCommercialDemoBuildSpecsRepository {
  constructor(private readonly db: D1Database) {}

  async getLatestForLifecycle(lifecycleId: string): Promise<CommercialDemoBuildSpec | null> {
    const row = await this.db.prepare(
      'SELECT * FROM lmw_commercial_demo_build_specs WHERE lifecycle_id = ? ORDER BY revision DESC LIMIT 1',
    ).bind(lifecycleId).first<Row>();
    return row ? map(row) : null;
  }

  async getById(id: string): Promise<CommercialDemoBuildSpec | null> {
    const row = await this.db.prepare('SELECT * FROM lmw_commercial_demo_build_specs WHERE id = ? LIMIT 1').bind(id).first<Row>();
    return row ? map(row) : null;
  }

  /** Idempotent only for the exact same immutable snapshot. */
  async create(input: {
    lifecycleId: string;
    intakeId: string;
    acceptedOfferId: string;
    schemaVersion: DemoBuildSpecV1['schemaVersion'];
    spec: DemoBuildSpecV1;
    specDigest: string;
  }): Promise<{ buildSpec: CommercialDemoBuildSpec; created: boolean }> {
    const latest = await this.getLatestForLifecycle(input.lifecycleId);
    if (latest?.specDigest === input.specDigest) return { buildSpec: latest, created: false };
    if (latest && latest.acceptedOfferId === input.acceptedOfferId) {
      throw new AppError('conflict', 'El expediente de demo aceptado ya existe y no puede sobrescribirse.');
    }
    const now = nowIso();
    const id = newId();
    const revision = (latest?.revision ?? 0) + 1;
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO lmw_commercial_demo_build_specs
       (id, lifecycle_id, intake_id, accepted_offer_id, revision, schema_version, spec_json, spec_digest, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, input.lifecycleId, input.intakeId, input.acceptedOfferId, revision, input.schemaVersion, JSON.stringify(input.spec), input.specDigest, now, now).run();
    if ((result.meta.changes ?? 0) === 1) return { buildSpec: (await this.getById(id))!, created: true };
    const existing = await this.getLatestForLifecycle(input.lifecycleId);
    if (existing?.specDigest === input.specDigest) return { buildSpec: existing, created: false };
    throw new AppError('conflict', 'Otro proceso creó un expediente de demo incompatible.');
  }
}

function map(row: Row): CommercialDemoBuildSpec {
  let spec: DemoBuildSpecV1;
  try { spec = JSON.parse(row.spec_json) as DemoBuildSpecV1; } catch { throw new AppError('internal_error', 'El expediente de demo almacenado es inválido.'); }
  return {
    id: row.id, lifecycleId: row.lifecycle_id, intakeId: row.intake_id, acceptedOfferId: row.accepted_offer_id,
    revision: row.revision, schemaVersion: row.schema_version as DemoBuildSpecV1['schemaVersion'],
    spec, specDigest: row.spec_digest, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
