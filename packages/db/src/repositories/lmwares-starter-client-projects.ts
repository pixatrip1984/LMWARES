import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  type StarterClientProject,
  type StarterClientProjectStatus,
} from '@starter/domain';
import { newId, nowIso } from '../helpers';

interface StarterClientProjectRow {
  id: string;
  work_order_id: string;
  intake_id: string;
  user_id: string;
  slug: string;
  site_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Subdomain labels reserved product-wide (shared with the free-tier slug
 * check in `routes/free-intakes.ts`). Kept in sync manually since the two
 * flows live in different packages.
 */
const RESERVED_CLIENT_PROJECT_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'astramuses',
  'cdn',
  'login',
  'mail',
  'media',
  'oracle',
  'soporte',
  'status',
  'www',
]);

const MAX_SLUG_ATTEMPTS = 50;

export class LmwaresStarterClientProjectsRepository {
  constructor(private readonly db: D1Database) {}

  async getById(id: string): Promise<StarterClientProject | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_starter_client_projects WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<StarterClientProjectRow>();
    return row ? mapStarterClientProject(row) : null;
  }

  async getByWorkOrderId(workOrderId: string): Promise<StarterClientProject | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_starter_client_projects WHERE work_order_id = ? LIMIT 1`)
      .bind(workOrderId)
      .first<StarterClientProjectRow>();
    return row ? mapStarterClientProject(row) : null;
  }

  async getByIntakeId(intakeId: string): Promise<StarterClientProject | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_starter_client_projects WHERE intake_id = ? LIMIT 1`)
      .bind(intakeId)
      .first<StarterClientProjectRow>();
    return row ? mapStarterClientProject(row) : null;
  }

  async getBySlug(slug: string): Promise<StarterClientProject | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_starter_client_projects WHERE slug = ? LIMIT 1`)
      .bind(slug)
      .first<StarterClientProjectRow>();
    return row ? mapStarterClientProject(row) : null;
  }

  async listForUser(userId: string): Promise<StarterClientProject[]> {
    const result = await this.db
      .prepare(`SELECT * FROM lmw_starter_client_projects WHERE user_id = ? ORDER BY created_at DESC`)
      .bind(userId)
      .all<StarterClientProjectRow>();
    return result.results.map(mapStarterClientProject);
  }

  async activateForWorkOrder(workOrderId: string): Promise<StarterClientProject | null> {
    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE lmw_starter_client_projects
         SET status = 'active', updated_at = ?
         WHERE work_order_id = ? AND status = 'provisioning'`,
      )
      .bind(now, workOrderId)
      .run();
    return this.getByWorkOrderId(workOrderId);
  }

  async archiveForWorkOrder(workOrderId: string): Promise<StarterClientProject | null> {
    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE lmw_starter_client_projects
         SET status = 'archived', updated_at = ?
         WHERE work_order_id = ? AND status <> 'archived'`,
      )
      .bind(now, workOrderId)
      .run();
    return this.getByWorkOrderId(workOrderId);
  }

  /**
   * Idempotently provisions the client-owned project/site once phase 1 of
   * the implementation payment is confirmed. Called from
   * `LmwaresStarterWorkOrdersRepository.ensureFromPaidBillingOrder`, which
   * may run more than once for the same billing order (webhook retries):
   * if a project already exists for this work order it is returned as-is
   * with no further writes.
   *
   * The slug is derived deterministically from the intake's business name
   * and never left to client input. Collisions (against the shared
   * `lmw_slug_reservations` namespace used by the free tier, and against
   * this table) are resolved by appending a numeric suffix and retrying.
   */
  async ensureForWorkOrder(input: {
    workOrderId: string;
    intakeId: string;
    userId: string;
  }): Promise<StarterClientProject> {
    const existing = await this.getByWorkOrderId(input.workOrderId);
    if (existing) return existing;

    const intake = await this.db
      .prepare(`SELECT business_name FROM lmw_package_intakes WHERE id = ? LIMIT 1`)
      .bind(input.intakeId)
      .first<{ business_name: string }>();
    if (!intake) throw AppError.notFound('Solicitud comercial');

    // Un ciclo demo_v1 ya posee la identidad pública desde fase 0. Al llegar
    // el pago de fase 1 se vincula a la orden pagada, sin emitir otro slug.
    const demo = await this.db
      .prepare(`SELECT slug, site_name FROM lmw_commercial_demo_lifecycles WHERE intake_id = ? LIMIT 1`)
      .bind(input.intakeId)
      .first<{ slug: string; site_name: string }>();
    if (demo) {
      const id = newId();
      const now = nowIso();
      try {
        await this.db
          .prepare(
            `INSERT INTO lmw_starter_client_projects
              (id, work_order_id, intake_id, user_id, slug, site_name, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'provisioning', ?, ?)`,
          )
          .bind(id, input.workOrderId, input.intakeId, input.userId, demo.slug, demo.site_name, now, now)
          .run();
        return (await this.getById(id))!;
      } catch (error) {
        const concurrent = await this.getByWorkOrderId(input.workOrderId);
        if (concurrent) return concurrent;
        throw error;
      }
    }

    const baseSlug = normalizeSlugBase(intake.business_name) || 'sitio-starter';
    const siteName = intake.business_name?.trim() || 'Tu sitio Starter';
    const id = newId();
    const now = nowIso();

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      if (RESERVED_CLIENT_PROJECT_SLUGS.has(candidate)) continue;
      if (!(await this.isSlugAvailable(candidate))) continue;

      try {
        await this.db.batch([
          this.db
            .prepare(
              `INSERT INTO lmw_slug_reservations (slug, intake_id, status, expires_at, created_at, updated_at)
               VALUES (?, ?, 'permanent', NULL, ?, ?)`,
            )
            .bind(candidate, input.intakeId, now, now),
          this.db
            .prepare(
              `INSERT INTO lmw_starter_client_projects
                (id, work_order_id, intake_id, user_id, slug, site_name, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'provisioning', ?, ?)`,
            )
            .bind(id, input.workOrderId, input.intakeId, input.userId, candidate, siteName, now, now),
        ]);
        return (await this.getById(id))!;
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        // Either another concurrent call already created the project for
        // this work order (webhook retry race), or the slug candidate was
        // just claimed by someone else. Distinguish the two before retrying.
        const concurrent = await this.getByWorkOrderId(input.workOrderId);
        if (concurrent) return concurrent;
        continue;
      }
    }
    throw new AppError('conflict', 'No se pudo generar un subdominio disponible para el proyecto.');
  }

  private async isSlugAvailable(slug: string): Promise<boolean> {
    const reservation = await this.db
      .prepare(`SELECT slug FROM lmw_slug_reservations WHERE slug = ? LIMIT 1`)
      .bind(slug)
      .first<{ slug: string }>();
    if (reservation) return false;

    const published = await this.db
      .prepare(`SELECT slug FROM lmw_published_sites WHERE slug = ? LIMIT 1`)
      .bind(slug)
      .first<{ slug: string }>();
    if (published) return false;

    const project = await this.db
      .prepare(`SELECT slug FROM lmw_starter_client_projects WHERE slug = ? LIMIT 1`)
      .bind(slug)
      .first<{ slug: string }>();
    return !project;
  }
}

/** Same normalization rules as the free-tier slug check in `routes/free-intakes.ts`. */
function normalizeSlugBase(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}

function mapStarterClientProject(row: StarterClientProjectRow): StarterClientProject {
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    intakeId: row.intake_id,
    userId: row.user_id,
    slug: row.slug,
    siteName: row.site_name,
    status: row.status as StarterClientProjectStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
