import type { D1Database } from '@cloudflare/workers-types';
import type {
  FileAsset,
  FreeContactMethod,
  FreeGenerationJob,
  FreeIntake,
  FreeIntakeAsset,
  Metadata,
} from '@starter/domain';
import { boolToDb, newId, nowIso, nullable } from '../helpers';
import {
  mapFreeContactMethod,
  mapFreeGenerationJob,
  mapFreeIntake,
  mapFreeIntakeAsset,
} from '../mappers';
import type {
  FreeContactMethodRow,
  FreeGenerationJobRow,
  FreeIntakeAssetRow,
  FreeIntakeRow,
  PublishedSiteRow,
} from '../rows';

export interface CreateFreeIntakeData {
  slug: string;
  siteName: string;
  contactName: string;
  contactEmail: string;
  businessDescription: string;
  audience: string;
  sector?: string | null;
  style: string;
  primaryAction: string;
  contacts: Array<{
    platform: string;
    value: string;
    label?: string | null;
    publicVisible: boolean;
  }>;
  metadata?: Metadata;
}

export interface CreateFreeAssetData {
  intakeId: string;
  fileAssetId: string;
  checksum?: string | null;
  position: number;
  role?: string;
  safetyStatus?: string;
}

export interface FreeAssetWithFile {
  asset: FreeIntakeAsset;
  fileAsset: FileAsset;
}

export interface PublishedSite {
  slug: string;
  intakeId: string;
  version: number;
  manifestKey: string;
  indexKey: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export class LmwaresFreeIntakesRepository {
  constructor(private readonly db: D1Database) {}

  async isSlugAvailable(slug: string): Promise<boolean> {
    const reservation = await this.db
      .prepare(`SELECT slug FROM lmw_slug_reservations WHERE slug = ? LIMIT 1`)
      .bind(slug)
      .first<{ slug: string }>();
    if (reservation) return false;

    const site = await this.db
      .prepare(`SELECT slug FROM lmw_published_sites WHERE slug = ? LIMIT 1`)
      .bind(slug)
      .first<{ slug: string }>();
    return !site;
  }

  async create(data: CreateFreeIntakeData): Promise<FreeIntake> {
    const id = newId();
    const now = nowIso();

    await this.db
      .prepare(
        `INSERT INTO lmw_slug_reservations
          (slug, intake_id, status, expires_at, created_at, updated_at)
         VALUES (?, ?, 'reserved', NULL, ?, ?)`,
      )
      .bind(data.slug, id, now, now)
      .run();

    await this.db
      .prepare(
        `INSERT INTO lmw_free_intakes
          (id, slug, site_name, status, contact_name, contact_email, business_description, audience,
           sector, style, primary_action, terms_accepted_at, metadata, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        data.slug,
        data.siteName,
        data.contactName,
        data.contactEmail,
        data.businessDescription,
        data.audience,
        nullable(data.sector),
        data.style,
        data.primaryAction,
        now,
        JSON.stringify(data.metadata ?? {}),
        now,
        now,
      )
      .run();

    for (const [position, contact] of data.contacts.entries()) {
      await this.db
        .prepare(
          `INSERT INTO lmw_contact_methods
            (id, intake_id, platform, value, label, public_visible, position, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          id,
          contact.platform,
          contact.value,
          nullable(contact.label),
          boolToDb(contact.publicVisible),
          position,
          now,
        )
        .run();
    }

    return (await this.getById(id))!;
  }

  async getById(id: string): Promise<FreeIntake | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_free_intakes WHERE id = ?`)
      .bind(id)
      .first<FreeIntakeRow>();
    return row ? mapFreeIntake(row) : null;
  }

  async listContacts(intakeId: string): Promise<FreeContactMethod[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM lmw_contact_methods WHERE intake_id = ? ORDER BY position ASC`)
      .bind(intakeId)
      .all<FreeContactMethodRow>();
    return results.map(mapFreeContactMethod);
  }

  async listAssets(intakeId: string): Promise<FreeIntakeAsset[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM lmw_free_assets WHERE intake_id = ? ORDER BY position ASC`)
      .bind(intakeId)
      .all<FreeIntakeAssetRow>();
    return results.map(mapFreeIntakeAsset);
  }

  async listAssetsWithFiles(intakeId: string): Promise<FreeAssetWithFile[]> {
    const { results } = await this.db
      .prepare(
        `SELECT
            a.*,
            f.id AS f_id,
            f.key AS f_key,
            f.bucket AS f_bucket,
            f.content_type AS f_content_type,
            f.size_bytes AS f_size_bytes,
            f.original_name AS f_original_name,
            f.checksum AS f_checksum,
            f.created_by AS f_created_by,
            f.created_at AS f_created_at
         FROM lmw_free_assets a
         INNER JOIN file_assets f ON f.id = a.file_asset_id
         WHERE a.intake_id = ?
         ORDER BY a.position ASC`,
      )
      .bind(intakeId)
      .all<FreeIntakeAssetRow & {
        f_id: string;
        f_key: string;
        f_bucket: string;
        f_content_type: string;
        f_size_bytes: number;
        f_original_name: string | null;
        f_checksum: string | null;
        f_created_by: string | null;
        f_created_at: string;
      }>();

    return results.map((row) => ({
      asset: mapFreeIntakeAsset(row),
      fileAsset: {
        id: row.f_id,
        key: row.f_key,
        bucket: row.f_bucket,
        contentType: row.f_content_type,
        sizeBytes: row.f_size_bytes,
        originalName: row.f_original_name,
        checksum: row.f_checksum,
        createdBy: row.f_created_by,
        createdAt: row.f_created_at,
      },
    }));
  }

  async countAssets(intakeId: string): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS count FROM lmw_free_assets WHERE intake_id = ?`)
      .bind(intakeId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async addAsset(data: CreateFreeAssetData): Promise<FreeIntakeAsset> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmw_free_assets
          (id, intake_id, file_asset_id, role, position, safety_status, checksum, width, height, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      )
      .bind(
        id,
        data.intakeId,
        data.fileAssetId,
        data.role ?? 'source',
        data.position,
        data.safetyStatus ?? 'quarantined',
        nullable(data.checksum),
        now,
      )
      .run();

    const row = await this.db
      .prepare(`SELECT * FROM lmw_free_assets WHERE id = ?`)
      .bind(id)
      .first<FreeIntakeAssetRow>();
    return mapFreeIntakeAsset(row!);
  }

  async submit(intakeId: string, requestId: string | null): Promise<FreeIntake | null> {
    const existing = await this.getById(intakeId);
    if (!existing) return null;
    if (existing.status !== 'draft') return existing;

    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE lmw_free_intakes
         SET status = 'queued', request_id = ?, submitted_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(nullable(requestId), now, now, intakeId)
      .run();

    await this.db
      .prepare(
        `UPDATE lmw_slug_reservations
         SET status = 'permanent', updated_at = ?
         WHERE intake_id = ?`,
      )
      .bind(now, intakeId)
      .run();

    const job = await this.createGenerationJob(intakeId, { source: 'free-intake-submit' });
    await this.db
      .prepare(
        `UPDATE lmw_free_intakes
         SET generation_job_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(job.id, nowIso(), intakeId)
      .run();

    return this.getById(intakeId);
  }

  async createGenerationJob(intakeId: string, metadata: Metadata = {}): Promise<FreeGenerationJob> {
    const existing = await this.getLatestGenerationJob(intakeId);
    if (existing) return existing;

    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmw_generation_jobs
          (id, intake_id, type, status, attempt, metadata, queued_at, created_at, updated_at)
         VALUES (?, ?, 'free-site-generation', 'queued', 0, ?, ?, ?, ?)`,
      )
      .bind(id, intakeId, JSON.stringify(metadata), now, now, now)
      .run();
    return (await this.getGenerationJobById(id))!;
  }

  async getLatestGenerationJob(intakeId: string): Promise<FreeGenerationJob | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM lmw_generation_jobs
         WHERE intake_id = ? AND type = 'free-site-generation'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(intakeId)
      .first<FreeGenerationJobRow>();
    return row ? mapFreeGenerationJob(row) : null;
  }

  async getGenerationJobById(id: string): Promise<FreeGenerationJob | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_generation_jobs WHERE id = ?`)
      .bind(id)
      .first<FreeGenerationJobRow>();
    return row ? mapFreeGenerationJob(row) : null;
  }

  async claimNextGenerationJob(claimedBy: string, leaseSeconds = 900): Promise<FreeGenerationJob | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM lmw_generation_jobs
         WHERE status = 'queued'
         ORDER BY queued_at ASC, created_at ASC
         LIMIT 1`,
      )
      .first<FreeGenerationJobRow>();
    if (!row) return null;

    const now = nowIso();
    const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    const result = await this.db
      .prepare(
        `UPDATE lmw_generation_jobs
         SET status = 'claimed',
             attempt = attempt + 1,
             lease_until = ?,
             claimed_by = ?,
             started_at = COALESCE(started_at, ?),
             updated_at = ?
         WHERE id = ? AND status = 'queued'`,
      )
      .bind(leaseUntil, claimedBy, now, now, row.id)
      .run();
    if ((result.meta.changes ?? 0) < 1) return null;

    await this.db
      .prepare(
        `UPDATE lmw_free_intakes
         SET status = 'generating', updated_at = ?
         WHERE id = ? AND status IN ('queued', 'submitted')`,
      )
      .bind(nowIso(), row.intake_id)
      .run();

    return this.getGenerationJobById(row.id);
  }

  async publishFreeSite(data: {
    jobId: string;
    manifestKey: string;
    indexKey: string;
    publicUrl: string;
  }): Promise<FreeIntake | null> {
    const job = await this.getGenerationJobById(data.jobId);
    if (!job) return null;

    const intake = await this.getById(job.intakeId);
    if (!intake) return null;

    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmw_published_sites
          (slug, intake_id, version, manifest_key, index_key, status, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, 'active', ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
          intake_id = excluded.intake_id,
          version = lmw_published_sites.version + 1,
          manifest_key = excluded.manifest_key,
          index_key = excluded.index_key,
          status = 'active',
          updated_at = excluded.updated_at`,
      )
      .bind(intake.slug, intake.id, data.manifestKey, data.indexKey, now, now)
      .run();

    await this.db
      .prepare(
        `UPDATE lmw_generation_jobs
         SET status = 'succeeded', completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, now, data.jobId)
      .run();

    await this.db
      .prepare(
        `UPDATE lmw_free_intakes
         SET status = 'published',
             published_url = ?,
             published_at = ?,
             error_code = NULL,
             error_message = NULL,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(data.publicUrl, now, now, intake.id)
      .run();

    return this.getById(intake.id);
  }

  async failGenerationJob(jobId: string, code: string, message: string): Promise<FreeGenerationJob | null> {
    const job = await this.getGenerationJobById(jobId);
    if (!job) return null;

    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE lmw_generation_jobs
         SET status = 'failed', error_code = ?, error_message = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(code, message, now, now, jobId)
      .run();

    await this.db
      .prepare(
        `UPDATE lmw_free_intakes
         SET status = 'generation_failed', error_code = ?, error_message = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(code, message, now, job.intakeId)
      .run();

    return this.getGenerationJobById(jobId);
  }

  async getPublishedSiteBySlug(slug: string): Promise<PublishedSite | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_published_sites WHERE slug = ? AND status = 'active'`)
      .bind(slug)
      .first<PublishedSiteRow>();
    return row ? mapPublishedSite(row) : null;
  }
}

function mapPublishedSite(row: PublishedSiteRow): PublishedSite {
  return {
    slug: row.slug,
    intakeId: row.intake_id,
    version: row.version,
    manifestKey: row.manifest_key,
    indexKey: row.index_key,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
