import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  type CommercialDemoCreativeRun,
  type CommercialDemoCreativeRunStatus,
  type CommercialDemoGenerationManifest,
  type CommercialDemoRelease,
  type CommercialDemoReleasePublicationStatus,
  type CommercialDemoReleaseReviewStatus,
  type DemoGenerationManifestV1,
  type SiteRouteManifestV1,
} from '@starter/domain';
import { newId, nowIso } from '../helpers';

type ManifestRow = { id: string; build_spec_id: string; lifecycle_id: string; revision: number; schema_version: string; manifest_json: string; manifest_digest: string; created_at: string; updated_at: string };
type RunRow = { id: string; lifecycle_id: string; job_id: string; generation_manifest_id: string; execution_generation: number; candidate_number: number; status: string; project_path: string | null; error_code: string | null; error_message: string | null; submitted_at: string | null; created_at: string; updated_at: string };
type ReleaseRow = { id: string; lifecycle_id: string; creative_run_id: string; build_spec_digest: string; manifest_digest: string; artifact_prefix: string; build_digest: string; asset_manifest_digest: string; evidence_digest: string; route_manifest_json: string; route_manifest_digest: string; review_status: string; publication_status: string; approved_at: string | null; approved_by: string | null; created_at: string; updated_at: string };

export class LmwaresCommercialDemoCreativeStudioRepository {
  constructor(private readonly db: D1Database) {}

  async getLatestManifest(lifecycleId: string): Promise<CommercialDemoGenerationManifest | null> {
    const row = await this.db.prepare('SELECT * FROM lmw_commercial_demo_generation_manifests WHERE lifecycle_id = ? ORDER BY revision DESC LIMIT 1').bind(lifecycleId).first<ManifestRow>();
    return row ? mapManifest(row) : null;
  }

  async createManifest(input: { buildSpecId: string; lifecycleId: string; schemaVersion: DemoGenerationManifestV1['schemaVersion']; manifest: DemoGenerationManifestV1; manifestDigest: string }): Promise<{ manifest: CommercialDemoGenerationManifest; created: boolean }> {
    const latest = await this.getLatestManifest(input.lifecycleId);
    if (latest?.manifestDigest === input.manifestDigest) return { manifest: latest, created: false };
    if (latest && latest.buildSpecId === input.buildSpecId) throw new AppError('conflict', 'El manifiesto creativo de este expediente ya existe y no puede reemplazarse.');
    const now = nowIso(); const id = newId(); const revision = (latest?.revision ?? 0) + 1;
    const created = await this.db.prepare(
      `INSERT OR IGNORE INTO lmw_commercial_demo_generation_manifests
       (id, build_spec_id, lifecycle_id, revision, schema_version, manifest_json, manifest_digest, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, input.buildSpecId, input.lifecycleId, revision, input.schemaVersion, JSON.stringify(input.manifest), input.manifestDigest, now, now).run();
    if ((created.meta.changes ?? 0) === 1) {
      const row = await this.db.prepare('SELECT * FROM lmw_commercial_demo_generation_manifests WHERE id = ?').bind(id).first<ManifestRow>();
      return { manifest: mapManifest(row!), created: true };
    }
    const concurrent = await this.getLatestManifest(input.lifecycleId);
    if (concurrent?.manifestDigest === input.manifestDigest) return { manifest: concurrent, created: false };
    throw new AppError('conflict', 'Otro proceso creó un manifiesto creativo incompatible.');
  }

  async getRunForJobGeneration(jobId: string, executionGeneration: number): Promise<CommercialDemoCreativeRun | null> {
    const row = await this.db.prepare('SELECT * FROM lmw_commercial_demo_creative_runs WHERE job_id = ? AND execution_generation = ? LIMIT 1').bind(jobId, executionGeneration).first<RunRow>();
    return row ? mapRun(row) : null;
  }

  async ensureRun(input: { lifecycleId: string; jobId: string; generationManifestId: string; executionGeneration: number; candidateNumber: number }): Promise<{ run: CommercialDemoCreativeRun; created: boolean }> {
    if (input.candidateNumber < 1 || input.candidateNumber > 2) throw new AppError('conflict', 'La demo ya agotó sus dos candidatos automáticos.');
    const existing = await this.getRunForJobGeneration(input.jobId, input.executionGeneration);
    if (existing) return { run: existing, created: false };
    const now = nowIso(); const id = newId();
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO lmw_commercial_demo_creative_runs
       (id, lifecycle_id, job_id, generation_manifest_id, execution_generation, candidate_number, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'claimed', ?, ?)`,
    ).bind(id, input.lifecycleId, input.jobId, input.generationManifestId, input.executionGeneration, input.candidateNumber, now, now).run();
    if ((result.meta.changes ?? 0) === 1) {
      const row = await this.db.prepare('SELECT * FROM lmw_commercial_demo_creative_runs WHERE id = ?').bind(id).first<RunRow>();
      return { run: mapRun(row!), created: true };
    }
    const concurrent = await this.getRunForJobGeneration(input.jobId, input.executionGeneration);
    if (concurrent) return { run: concurrent, created: false };
    throw new AppError('conflict', 'No se pudo crear el run creativo.');
  }

  async setRunStatus(input: { id: string; status: CommercialDemoCreativeRunStatus; projectPath?: string | null; errorCode?: string | null; errorMessage?: string | null }): Promise<CommercialDemoCreativeRun> {
    const now = nowIso();
    const result = await this.db.prepare(
      `UPDATE lmw_commercial_demo_creative_runs SET status = ?, project_path = COALESCE(?, project_path),
       error_code = ?, error_message = ?, submitted_at = CASE WHEN ? = 'submitted' THEN COALESCE(submitted_at, ?) ELSE submitted_at END, updated_at = ? WHERE id = ?`,
    ).bind(input.status, input.projectPath ?? null, input.errorCode ?? null, input.errorMessage?.slice(0, 500) ?? null, input.status, now, now, input.id).run();
    if ((result.meta.changes ?? 0) !== 1) throw AppError.notFound('Run creativo');
    const row = await this.db.prepare('SELECT * FROM lmw_commercial_demo_creative_runs WHERE id = ?').bind(input.id).first<RunRow>();
    return mapRun(row!);
  }

  async getReleaseById(id: string): Promise<CommercialDemoRelease | null> {
    const row = await this.db.prepare('SELECT * FROM lmw_commercial_demo_releases WHERE id = ? LIMIT 1').bind(id).first<ReleaseRow>();
    return row ? mapRelease(row) : null;
  }

  async createRelease(input: { lifecycleId: string; creativeRunId: string; buildSpecDigest: string; manifestDigest: string; artifactPrefix: string; buildDigest: string; assetManifestDigest: string; evidenceDigest: string; routeManifest: SiteRouteManifestV1; routeManifestDigest: string }): Promise<CommercialDemoRelease> {
    if (!input.artifactPrefix.startsWith(`commercial-demos/${input.lifecycleId}/releases/`) || input.artifactPrefix.includes('..')) throw new AppError('validation_error', 'El prefijo del release es inválido.');
    const now = nowIso(); const id = newId();
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO lmw_commercial_demo_releases
       (id, lifecycle_id, creative_run_id, build_spec_digest, manifest_digest, artifact_prefix, build_digest, asset_manifest_digest, evidence_digest, route_manifest_json, route_manifest_digest, review_status, publication_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unpublished', ?, ?)`,
    ).bind(id, input.lifecycleId, input.creativeRunId, input.buildSpecDigest, input.manifestDigest, input.artifactPrefix, input.buildDigest, input.assetManifestDigest, input.evidenceDigest, JSON.stringify(input.routeManifest), input.routeManifestDigest, now, now).run();
    if ((result.meta.changes ?? 0) === 1) return (await this.getReleaseById(id))!;
    const existing = await this.db.prepare('SELECT * FROM lmw_commercial_demo_releases WHERE creative_run_id = ? LIMIT 1').bind(input.creativeRunId).first<ReleaseRow>();
    if (existing) return mapRelease(existing);
    throw new AppError('conflict', 'No se pudo crear el release de demo.');
  }
}

function mapManifest(row: ManifestRow): CommercialDemoGenerationManifest {
  let manifest: DemoGenerationManifestV1;
  try { manifest = JSON.parse(row.manifest_json) as DemoGenerationManifestV1; } catch { throw new AppError('internal_error', 'El manifiesto creativo almacenado es inválido.'); }
  return { id: row.id, buildSpecId: row.build_spec_id, lifecycleId: row.lifecycle_id, revision: row.revision, schemaVersion: row.schema_version as DemoGenerationManifestV1['schemaVersion'], manifest, manifestDigest: row.manifest_digest, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapRun(row: RunRow): CommercialDemoCreativeRun {
  return { id: row.id, lifecycleId: row.lifecycle_id, jobId: row.job_id, generationManifestId: row.generation_manifest_id, executionGeneration: row.execution_generation, candidateNumber: row.candidate_number, status: row.status as CommercialDemoCreativeRunStatus, projectPath: row.project_path, errorCode: row.error_code, errorMessage: row.error_message, submittedAt: row.submitted_at, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapRelease(row: ReleaseRow): CommercialDemoRelease {
  let routeManifest: SiteRouteManifestV1;
  try { routeManifest = JSON.parse(row.route_manifest_json) as SiteRouteManifestV1; } catch { throw new AppError('internal_error', 'El release almacenó rutas inválidas.'); }
  return { id: row.id, lifecycleId: row.lifecycle_id, creativeRunId: row.creative_run_id, buildSpecDigest: row.build_spec_digest, manifestDigest: row.manifest_digest, artifactPrefix: row.artifact_prefix, buildDigest: row.build_digest, assetManifestDigest: row.asset_manifest_digest, evidenceDigest: row.evidence_digest, routeManifest, reviewStatus: row.review_status as CommercialDemoReleaseReviewStatus, publicationStatus: row.publication_status as CommercialDemoReleasePublicationStatus, approvedAt: row.approved_at, approvedBy: row.approved_by, createdAt: row.created_at, updatedAt: row.updated_at };
}
