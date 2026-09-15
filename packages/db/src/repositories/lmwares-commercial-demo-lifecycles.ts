import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  type CommercialDemoLifecycle,
  type CommercialDemoLifecycleStatus,
  type CommercialDemoPhase,
  type CommercialDemoPhaseStatus,
} from '@starter/domain';
import { newId, nowIso } from '../helpers';

type LifecycleRow = {
  id: string; intake_id: string; commercial_offer_id: string; user_id: string; slug: string;
  site_name: string; status: string; demo_asset_key: string | null; demo_release_id: string | null; demo_published_at: string | null;
  phase_zero_completed_at: string | null; work_order_id: string | null; oracle_project_id: string | null;
  created_at: string; updated_at: string;
};
type PhaseRow = {
  id: string; lifecycle_id: string; phase: number; status: string; evidence: string | null;
  started_at: string | null; completed_at: string | null; completed_by: string | null;
  created_at: string; updated_at: string;
};

const RESERVED = new Set(['admin', 'api', 'app', 'assets', 'cdn', 'login', 'mail', 'media', 'oracle', 'soporte', 'status', 'www']);

export class LmwaresCommercialDemoLifecyclesRepository {
  constructor(private readonly db: D1Database) {}

  async getByIntakeId(intakeId: string): Promise<CommercialDemoLifecycle | null> {
    const row = await this.db.prepare('SELECT * FROM lmw_commercial_demo_lifecycles WHERE intake_id = ? LIMIT 1').bind(intakeId).first<LifecycleRow>();
    return row ? mapLifecycle(row) : null;
  }
  async getById(id: string): Promise<CommercialDemoLifecycle | null> {
    const row = await this.db.prepare('SELECT * FROM lmw_commercial_demo_lifecycles WHERE id = ? LIMIT 1').bind(id).first<LifecycleRow>();
    return row ? mapLifecycle(row) : null;
  }
  async getBySlug(slug: string): Promise<CommercialDemoLifecycle | null> {
    const row = await this.db.prepare('SELECT * FROM lmw_commercial_demo_lifecycles WHERE slug = ? LIMIT 1').bind(slug).first<LifecycleRow>();
    return row ? mapLifecycle(row) : null;
  }
  async listForUser(userId: string): Promise<CommercialDemoLifecycle[]> {
    const result = await this.db.prepare('SELECT * FROM lmw_commercial_demo_lifecycles WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all<LifecycleRow>();
    return result.results.map(mapLifecycle);
  }
  async listPhases(lifecycleId: string): Promise<CommercialDemoPhase[]> {
    const result = await this.db.prepare('SELECT * FROM lmw_commercial_demo_phases WHERE lifecycle_id = ? ORDER BY phase ASC').bind(lifecycleId).all<PhaseRow>();
    return result.results.map(mapPhase);
  }
  async ensureAcceptedOffer(input: { intakeId: string; offerId: string; userId: string }): Promise<{ lifecycle: CommercialDemoLifecycle; created: boolean }> {
    const existing = await this.getByIntakeId(input.intakeId);
    if (existing) {
      if (existing.commercialOfferId !== input.offerId || existing.userId !== input.userId) throw new AppError('conflict', 'La demo existente no coincide con la oferta aceptada.');
      return { lifecycle: existing, created: false };
    }
    const intake = await this.db.prepare('SELECT business_name FROM lmw_package_intakes WHERE id = ? LIMIT 1').bind(input.intakeId).first<{ business_name: string }>();
    if (!intake) throw AppError.notFound('Solicitud comercial');
    const base = normalizeSlug(intake.business_name) || 'demo-lmwares';
    const now = nowIso();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      if (RESERVED.has(slug)) continue;
      const id = newId();
      try {
        await this.db.batch([
          this.db.prepare(`INSERT INTO lmw_slug_reservations (slug, intake_id, status, expires_at, created_at, updated_at) VALUES (?, ?, 'permanent', NULL, ?, ?)`).bind(slug, input.intakeId, now, now),
          this.db.prepare(`INSERT INTO lmw_commercial_demo_lifecycles (id, intake_id, commercial_offer_id, user_id, slug, site_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'demo_preparing', ?, ?)`).bind(id, input.intakeId, input.offerId, input.userId, slug, intake.business_name.trim() || 'Tu demo LMWares', now, now),
          ...[0, 1, 2, 3, 4].map((phase) => this.db.prepare(`INSERT INTO lmw_commercial_demo_phases (id, lifecycle_id, phase, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(newId(), id, phase, phase === 0 ? 'in_progress' : 'locked', now, now)),
        ]);
        return { lifecycle: (await this.getById(id))!, created: true };
      } catch (error) {
        const concurrent = await this.getByIntakeId(input.intakeId);
        if (concurrent) return { lifecycle: concurrent, created: false };
        if (!(error instanceof Error) || !/unique constraint/i.test(error.message)) throw error;
      }
    }
    throw new AppError('conflict', 'No se pudo reservar un subdominio para la demo.');
  }
  async publishDemo(input: { intakeId: string; assetKey: string; actor: string }): Promise<CommercialDemoLifecycle> {
    const lifecycle = await this.getByIntakeId(input.intakeId);
    if (!lifecycle) throw AppError.notFound('Demo comercial');
    if (lifecycle.status === 'canceled') throw new AppError('conflict', 'La demo está cancelada.');
    const now = nowIso();
    await this.db.prepare(`UPDATE lmw_commercial_demo_lifecycles SET demo_asset_key = ?, demo_published_at = ?, status = 'demo_ready', updated_at = ? WHERE id = ?`).bind(input.assetKey, now, now, lifecycle.id).run();
    return (await this.getById(lifecycle.id))!;
  }
  async completePhaseZero(input: { intakeId: string; actor: string; evidence: string }): Promise<CommercialDemoLifecycle> {
    const lifecycle = await this.getByIntakeId(input.intakeId);
    if (!lifecycle) throw AppError.notFound('Demo comercial');
    if (!lifecycle.demoAssetKey) throw new AppError('conflict', 'Publica una demo antes de terminar la fase 0.');
    if (lifecycle.phaseZeroCompletedAt) return lifecycle;
    const now = nowIso();
    await this.db.batch([
      this.db.prepare(`UPDATE lmw_commercial_demo_phases SET status = 'completed', evidence = ?, completed_at = ?, completed_by = ?, updated_at = ? WHERE lifecycle_id = ? AND phase = 0 AND status = 'in_progress'`).bind(input.evidence, now, input.actor, now, lifecycle.id),
      this.db.prepare(`UPDATE lmw_commercial_demo_lifecycles SET status = 'demo_ready', phase_zero_completed_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, lifecycle.id),
    ]);
    return (await this.getById(lifecycle.id))!;
  }
  async continueImplementation(input: { intakeId: string }): Promise<CommercialDemoLifecycle> {
    const lifecycle = await this.getByIntakeId(input.intakeId);
    if (!lifecycle) throw AppError.notFound('Demo comercial');
    if (!lifecycle.phaseZeroCompletedAt || (!lifecycle.demoReleaseId && !lifecycle.demoAssetKey)) {
      throw new AppError('conflict', 'La demo debe aprobarse antes de continuar con la implementación.');
    }
    if (lifecycle.status === 'phase_1_payment_due') return lifecycle;
    if (!['demo_ready', 'phase_1_decision_pending'].includes(lifecycle.status)) {
      throw new AppError('conflict', 'Esta demo ya no admite una nueva decisión de implementación.');
    }
    const now = nowIso();
    await this.db.batch([
      this.db.prepare(`UPDATE lmw_commercial_demo_phases SET status = 'payment_due', updated_at = ? WHERE lifecycle_id = ? AND phase = 1 AND status = 'locked'`).bind(now, lifecycle.id),
      this.db.prepare(`UPDATE lmw_commercial_demo_lifecycles SET status = 'phase_1_payment_due', updated_at = ? WHERE id = ? AND status IN ('demo_ready', 'phase_1_decision_pending')`).bind(now, lifecycle.id),
    ]);
    return (await this.getById(lifecycle.id))!;
  }
  async attachApprovedRelease(input: { lifecycleId: string; releaseId: string; actor: string; evidence: string }): Promise<CommercialDemoLifecycle> {
    const lifecycle = await this.getById(input.lifecycleId);
    if (!lifecycle) throw AppError.notFound('Demo comercial');
    if (lifecycle.status === 'canceled') throw new AppError('conflict', 'La demo está cancelada.');
    const release = await this.db.prepare(`SELECT id, lifecycle_id, artifact_prefix, review_status, publication_status FROM lmw_commercial_demo_releases WHERE id = ? LIMIT 1`).bind(input.releaseId).first<{ id: string; lifecycle_id: string; artifact_prefix: string; review_status: string; publication_status: string }>();
    if (!release || release.lifecycle_id !== lifecycle.id) throw AppError.notFound('Release de demo');
    if (!['pending', 'approved'].includes(release.review_status) || !['unpublished', 'published'].includes(release.publication_status)) {
      throw new AppError('conflict', 'Esta release no está disponible para aprobación.');
    }
    if (lifecycle.demoReleaseId && lifecycle.demoReleaseId !== release.id) throw new AppError('conflict', 'Ya hay otra release aprobada para esta demo.');
    const now = nowIso();
    const assetKey = `${release.artifact_prefix}index.html`;
    await this.db.batch([
      this.db.prepare(`UPDATE lmw_commercial_demo_releases SET review_status = 'approved', publication_status = 'published', approved_at = COALESCE(approved_at, ?), approved_by = COALESCE(approved_by, ?), updated_at = ? WHERE id = ? AND review_status IN ('pending', 'approved') AND publication_status IN ('unpublished', 'published')`).bind(now, input.actor, now, release.id),
      this.db.prepare(`UPDATE lmw_commercial_demo_phases SET status = 'completed', evidence = COALESCE(evidence, ?), completed_at = COALESCE(completed_at, ?), completed_by = COALESCE(completed_by, ?), updated_at = ? WHERE lifecycle_id = ? AND phase = 0 AND status IN ('in_progress', 'completed')`).bind(input.evidence, now, input.actor, now, lifecycle.id),
      this.db.prepare(`UPDATE lmw_commercial_demo_lifecycles SET demo_release_id = ?, demo_asset_key = ?, demo_published_at = COALESCE(demo_published_at, ?), phase_zero_completed_at = COALESCE(phase_zero_completed_at, ?), status = 'demo_ready', updated_at = ? WHERE id = ?`).bind(release.id, assetKey, now, now, now, lifecycle.id),
    ]);
    return (await this.getById(lifecycle.id))!;
  }
  async attachPaidWorkOrder(input: { intakeId: string; workOrderId: string }): Promise<void> {
    const lifecycle = await this.getByIntakeId(input.intakeId);
    if (!lifecycle) return;
    const now = nowIso();
    await this.db.batch([
      this.db.prepare(`UPDATE lmw_commercial_demo_lifecycles SET work_order_id = ?, status = 'in_implementation', updated_at = ? WHERE id = ? AND work_order_id IS NULL`).bind(input.workOrderId, now, lifecycle.id),
      this.db.prepare(`UPDATE lmw_commercial_demo_phases SET status = 'payment_confirmed', updated_at = ? WHERE lifecycle_id = ? AND phase = 1 AND status = 'payment_due'`).bind(now, lifecycle.id),
    ]);
  }
  async startPhase(input: { intakeId: string; phase: 1 | 2 | 3 | 4; actor: string }): Promise<CommercialDemoPhase> {
    const lifecycle = await this.getByIntakeId(input.intakeId);
    if (!lifecycle) throw AppError.notFound('Demo comercial');
    const phases = await this.listPhases(lifecycle.id);
    const previous = phases.find((item) => item.phase === input.phase - 1);
    const current = phases.find((item) => item.phase === input.phase);
    if (!previous?.completedAt) throw new AppError('conflict', 'Primero termina la fase anterior.');
    if (!current) throw AppError.notFound('Fase comercial');
    if (current.status === 'completed' || current.status === 'in_progress') return current;
    const now = nowIso();
    await this.db.batch([
      this.db.prepare(`UPDATE lmw_commercial_demo_phases SET status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND status IN ('payment_due', 'payment_confirmed')`).bind(now, now, current.id),
      this.db.prepare(`UPDATE lmw_commercial_demo_lifecycles SET status = ?, updated_at = ? WHERE id = ?`).bind(input.phase === 1 ? 'in_implementation' : input.phase === 2 ? 'in_implementation' : input.phase === 3 ? 'client_review' : 'ready_to_publish', now, lifecycle.id),
    ]);
    return (await this.listPhases(lifecycle.id)).find((item) => item.phase === input.phase)!;
  }
  async completePaidPhase(input: { intakeId: string; phase: 1 | 2 | 3 | 4; actor: string; evidence: string }): Promise<CommercialDemoPhase> {
    const lifecycle = await this.getByIntakeId(input.intakeId);
    if (!lifecycle) throw AppError.notFound('Demo comercial');
    const phases = await this.listPhases(lifecycle.id);
    const current = phases.find((item) => item.phase === input.phase);
    if (!current) throw AppError.notFound('Fase comercial');
    if (current.completedAt) return current;
    if (current.status !== 'in_progress') throw new AppError('conflict', 'Inicia la fase antes de marcarla terminada.');
    const now = nowIso();
    const nextStatus = input.phase === 4 ? 'live' : input.phase === 3 ? 'ready_to_publish' : 'client_review';
    const statements = [
      this.db.prepare(`UPDATE lmw_commercial_demo_phases SET status = 'completed', evidence = ?, completed_at = ?, completed_by = ?, updated_at = ? WHERE id = ?`).bind(input.evidence, now, input.actor, now, current.id),
      this.db.prepare(`UPDATE lmw_commercial_demo_lifecycles SET status = ?, updated_at = ? WHERE id = ?`).bind(nextStatus, now, lifecycle.id),
    ];
    if (input.phase < 4) statements.push(this.db.prepare(`UPDATE lmw_commercial_demo_phases SET status = 'payment_due', updated_at = ? WHERE lifecycle_id = ? AND phase = ? AND status = 'locked'`).bind(now, lifecycle.id, input.phase + 1));
    await this.db.batch(statements);
    return (await this.listPhases(lifecycle.id)).find((item) => item.phase === input.phase)!;
  }
}

function normalizeSlug(value: string): string { return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, ''); }
function mapLifecycle(row: LifecycleRow): CommercialDemoLifecycle { return { id: row.id, intakeId: row.intake_id, commercialOfferId: row.commercial_offer_id, userId: row.user_id, slug: row.slug, siteName: row.site_name, status: row.status as CommercialDemoLifecycleStatus, demoAssetKey: row.demo_asset_key, demoReleaseId: row.demo_release_id, demoPublishedAt: row.demo_published_at, phaseZeroCompletedAt: row.phase_zero_completed_at, workOrderId: row.work_order_id, oracleProjectId: row.oracle_project_id, createdAt: row.created_at, updatedAt: row.updated_at }; }
function mapPhase(row: PhaseRow): CommercialDemoPhase { return { id: row.id, lifecycleId: row.lifecycle_id, phase: row.phase as 0 | 1 | 2 | 3 | 4, status: row.status as CommercialDemoPhaseStatus, evidence: row.evidence, startedAt: row.started_at, completedAt: row.completed_at, completedBy: row.completed_by, createdAt: row.created_at, updatedAt: row.updated_at }; }
