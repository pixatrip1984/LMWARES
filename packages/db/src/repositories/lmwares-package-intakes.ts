import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  type Metadata,
  type PackageIntake,
  type PackageIntakeStatus,
  type PaidPackageModuleId,
  type PaidPackagePlan,
} from '@starter/domain';
import { boolFromDb, boolToDb, newId, nowIso, parseMetadata } from '../helpers';

interface PackageIntakeRow {
  id: string;
  submission_key: string;
  user_id: string;
  plan: string;
  modules: string;
  marketing: number;
  status: string;
  estimated_implementation_cents: number;
  estimated_monthly_cents: number;
  currency: string;
  pricing_version: string;
  maintenance_start_policy: string;
  package_snapshot: string;
  proposal_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export class LmwaresPackageIntakesRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: {
    submissionKey: string;
    userId: string;
    plan: PaidPackagePlan;
    modules: PaidPackageModuleId[];
    marketing: boolean;
    estimatedImplementationCents: number;
    estimatedMonthlyCents: number;
    pricingVersion: string;
    packageSnapshot: Metadata;
  }): Promise<{ intake: PackageIntake; created: boolean }> {
    const id = newId();
    const now = nowIso();
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO lmw_package_intakes
          (id, submission_key, user_id, plan, modules, marketing, status,
           estimated_implementation_cents, estimated_monthly_cents, currency,
           pricing_version, maintenance_start_policy, package_snapshot,
           submitted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?, 'MXN', ?, 'on_go_live', ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.submissionKey,
        input.userId,
        input.plan,
        JSON.stringify(input.modules),
        boolToDb(input.marketing),
        input.estimatedImplementationCents,
        input.estimatedMonthlyCents,
        input.pricingVersion,
        JSON.stringify(input.packageSnapshot),
        now,
        now,
        now,
      )
      .run();
    const intake = await this.getBySubmissionKey(input.submissionKey);
    if (!intake || intake.userId !== input.userId) {
      throw new AppError('conflict', 'La clave de envío ya pertenece a otra solicitud.');
    }
    return { intake, created: (result.meta.changes ?? 0) === 1 };
  }

  async getById(id: string): Promise<PackageIntake | null> {
    const row = await this.db
      .prepare('SELECT * FROM lmw_package_intakes WHERE id = ? LIMIT 1')
      .bind(id)
      .first<PackageIntakeRow>();
    return row ? mapPackageIntake(row) : null;
  }

  async getBySubmissionKey(submissionKey: string): Promise<PackageIntake | null> {
    const row = await this.db
      .prepare('SELECT * FROM lmw_package_intakes WHERE submission_key = ? LIMIT 1')
      .bind(submissionKey)
      .first<PackageIntakeRow>();
    return row ? mapPackageIntake(row) : null;
  }

  async listForUser(userId: string, limit = 50): Promise<PackageIntake[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM lmw_package_intakes
         WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(userId, safeLimit(limit))
      .all<PackageIntakeRow>();
    return result.results.map(mapPackageIntake);
  }

  async listForReview(input: {
    status?: PackageIntakeStatus;
    limit?: number;
  }): Promise<PackageIntake[]> {
    const status = input.status ?? null;
    const result = await this.db
      .prepare(
        `SELECT * FROM lmw_package_intakes
         WHERE (? IS NULL OR status = ?)
         ORDER BY CASE status WHEN 'submitted' THEN 0 WHEN 'scope_review' THEN 1 ELSE 2 END,
                  updated_at ASC
         LIMIT ?`,
      )
      .bind(status, status, safeLimit(input.limit ?? 50))
      .all<PackageIntakeRow>();
    return result.results.map(mapPackageIntake);
  }

  async review(input: {
    id: string;
    status: 'scope_review' | 'declined';
    reviewedBy: string;
    notes: string | null;
  }): Promise<PackageIntake> {
    const now = nowIso();
    const result = await this.db
      .prepare(
        `UPDATE lmw_package_intakes
         SET status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ?, updated_at = ?
         WHERE id = ? AND status IN ('submitted', 'scope_review')`,
      )
      .bind(input.status, input.reviewedBy, now, input.notes, now, input.id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      const current = await this.getById(input.id);
      if (!current) throw AppError.notFound('Solicitud comercial');
      throw new AppError('conflict', 'La solicitud ya no admite esa revisión.');
    }
    return (await this.getById(input.id))!;
  }
}

function mapPackageIntake(row: PackageIntakeRow): PackageIntake {
  return {
    id: row.id,
    submissionKey: row.submission_key,
    userId: row.user_id,
    plan: row.plan as PaidPackagePlan,
    modules: parseModules(row.modules),
    marketing: boolFromDb(row.marketing),
    status: row.status as PackageIntakeStatus,
    estimatedImplementationCents: row.estimated_implementation_cents,
    estimatedMonthlyCents: row.estimated_monthly_cents,
    currency: 'MXN',
    pricingVersion: row.pricing_version,
    maintenanceStartPolicy: 'on_go_live',
    packageSnapshot: parseMetadata(row.package_snapshot),
    proposalId: row.proposal_id,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseModules(value: string): PaidPackageModuleId[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as PaidPackageModuleId[]) : [];
  } catch {
    return [];
  }
}

function safeLimit(value: number): number {
  return Math.max(1, Math.min(100, Math.trunc(value)));
}
