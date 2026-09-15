import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  type CommercialAgentJob,
  type CommercialAgentJobStatus,
  type CommercialAgentJobType,
  type Metadata,
} from '@starter/domain';
import { newId, nowIso, parseMetadata } from '../helpers';

type JobRow = {
  id: string; intake_id: string; lifecycle_id: string | null; job_type: string; status: string;
  attempt: number; max_attempts: number; claimed_by: string | null; lease_until: string | null; lease_token: string | null; execution_generation: number;
  project_path: string | null; result_json: string | null; error_code: string | null;
  error_message: string | null; created_at: string; updated_at: string; completed_at: string | null;
};

export class LmwaresCommercialAgentJobsRepository {
  constructor(private readonly db: D1Database) {}

  async enqueue(input: { intakeId: string; lifecycleId?: string | null; jobType: CommercialAgentJobType }): Promise<CommercialAgentJob> {
    const now = nowIso();
    const id = newId();
    await this.db.prepare(
      `INSERT OR IGNORE INTO lmw_commercial_agent_jobs
       (id, intake_id, lifecycle_id, job_type, status, attempt, max_attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 0, 2, ?, ?)`,
    ).bind(id, input.intakeId, input.lifecycleId ?? null, input.jobType, now, now).run();
    const job = await this.getForIntake(input.intakeId, input.jobType);
    if (!job) throw new AppError('internal_error', 'No se pudo encolar el trabajo comercial.');
    return job;
  }

  async getById(id: string): Promise<CommercialAgentJob | null> {
    const row = await this.db.prepare('SELECT * FROM lmw_commercial_agent_jobs WHERE id = ? LIMIT 1').bind(id).first<JobRow>();
    return row ? mapJob(row) : null;
  }

  async getForIntake(intakeId: string, jobType: CommercialAgentJobType): Promise<CommercialAgentJob | null> {
    const row = await this.db.prepare('SELECT * FROM lmw_commercial_agent_jobs WHERE intake_id = ? AND job_type = ? LIMIT 1').bind(intakeId, jobType).first<JobRow>();
    return row ? mapJob(row) : null;
  }

  async listForIntake(intakeId: string): Promise<CommercialAgentJob[]> {
    const rows = await this.db.prepare('SELECT * FROM lmw_commercial_agent_jobs WHERE intake_id = ? ORDER BY created_at DESC').bind(intakeId).all<JobRow>();
    return rows.results.map(mapJob);
  }

  async claimNext(jobType: CommercialAgentJobType, runnerId: string, leaseMs = 15 * 60_000): Promise<CommercialAgentJob | null> {
    const now = nowIso();
    const candidate = await this.db.prepare(
      `SELECT * FROM lmw_commercial_agent_jobs
       WHERE job_type = ? AND (status = 'queued' OR (status = 'claimed' AND lease_until < ?))
         AND attempt < max_attempts
       ORDER BY created_at ASC LIMIT 1`,
    ).bind(jobType, now).first<JobRow>();
    if (!candidate) return null;
    const leaseUntil = new Date(Date.now() + leaseMs).toISOString();
    const leaseToken = newId();
    const updated = await this.db.prepare(
      `UPDATE lmw_commercial_agent_jobs SET status = 'claimed', claimed_by = ?, lease_until = ?, lease_token = ?,
       execution_generation = execution_generation + 1, attempt = attempt + 1, updated_at = ?
       WHERE id = ? AND (status = 'queued' OR (status = 'claimed' AND lease_until < ?))`,
    ).bind(runnerId, leaseUntil, leaseToken, now, candidate.id, now).run();
    if ((updated.meta.changes ?? 0) !== 1) return null;
    return this.getById(candidate.id);
  }

  async claimById(id: string, runnerId: string, leaseMs = 15 * 60_000): Promise<CommercialAgentJob | null> {
    const now = nowIso();
    const leaseUntil = new Date(Date.now() + leaseMs).toISOString();
    const leaseToken = newId();
    const updated = await this.db.prepare(
      `UPDATE lmw_commercial_agent_jobs SET status = 'claimed', claimed_by = ?, lease_until = ?, lease_token = ?,
       execution_generation = execution_generation + 1, attempt = attempt + 1, updated_at = ?
       WHERE id = ? AND status = 'queued' AND attempt < max_attempts`,
    ).bind(runnerId, leaseUntil, leaseToken, now, id).run();
    return (updated.meta.changes ?? 0) === 1 ? this.getById(id) : null;
  }

  async heartbeat(input: { id: string; runnerId: string; leaseToken: string; leaseMs?: number }): Promise<CommercialAgentJob> {
    const now = nowIso();
    const leaseUntil = new Date(Date.now() + (input.leaseMs ?? 120_000)).toISOString();
    const result = await this.db.prepare(
      `UPDATE lmw_commercial_agent_jobs SET lease_until = ?, updated_at = ?
       WHERE id = ? AND status = 'claimed' AND claimed_by = ? AND lease_token = ? AND lease_until > ?`,
    ).bind(leaseUntil, now, input.id, input.runnerId, input.leaseToken, now).run();
    if ((result.meta.changes ?? 0) !== 1) throw new AppError('conflict', 'El lease del trabajo ya venció o fue reasignado.');
    return (await this.getById(input.id))!;
  }

  async complete(input: { id: string; runnerId: string; leaseToken: string; projectPath?: string | null; result?: Metadata | null }): Promise<CommercialAgentJob> {
    const now = nowIso();
    const result = await this.db.prepare(
      `UPDATE lmw_commercial_agent_jobs SET status = 'completed', project_path = COALESCE(?, project_path),
       result_json = ?, completed_at = ?, updated_at = ?, lease_until = NULL
       WHERE id = ? AND status = 'claimed' AND claimed_by = ? AND lease_token = ? AND lease_until > ?`,
    ).bind(input.projectPath ?? null, input.result ? JSON.stringify(input.result) : null, now, now, input.id, input.runnerId, input.leaseToken, now).run();
    if ((result.meta.changes ?? 0) !== 1) throw new AppError('conflict', 'El trabajo ya no pertenece a este ejecutor.');
    return (await this.getById(input.id))!;
  }

  async fail(input: { id: string; runnerId: string; leaseToken: string; code: string; message: string }): Promise<CommercialAgentJob> {
    const now = nowIso();
    const result = await this.db.prepare(
      `UPDATE lmw_commercial_agent_jobs SET status = CASE WHEN attempt < max_attempts THEN 'queued' ELSE 'failed' END,
       claimed_by = NULL, lease_until = NULL, lease_token = NULL, error_code = ?, error_message = ?, updated_at = ?
       WHERE id = ? AND status = 'claimed' AND claimed_by = ? AND lease_token = ? AND lease_until > ?`,
    ).bind(input.code.slice(0, 80), input.message.slice(0, 500), now, input.id, input.runnerId, input.leaseToken, now).run();
    if ((result.meta.changes ?? 0) !== 1) throw new AppError('conflict', 'El trabajo ya no pertenece a este ejecutor.');
    return (await this.getById(input.id))!;
  }
}

function mapJob(row: JobRow): CommercialAgentJob {
  return {
    id: row.id, intakeId: row.intake_id, lifecycleId: row.lifecycle_id,
    jobType: row.job_type as CommercialAgentJobType, status: row.status as CommercialAgentJobStatus,
    attempt: row.attempt, maxAttempts: row.max_attempts, claimedBy: row.claimed_by,
    leaseUntil: row.lease_until, leaseToken: row.lease_token, executionGeneration: row.execution_generation, projectPath: row.project_path,
    result: row.result_json ? parseMetadata(row.result_json) : null, errorCode: row.error_code,
    errorMessage: row.error_message, createdAt: row.created_at, updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}
