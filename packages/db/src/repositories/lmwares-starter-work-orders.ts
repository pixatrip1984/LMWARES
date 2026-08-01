import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  type Metadata,
  type StarterWorkOrder,
  type StarterWorkOrderStatus,
} from '@starter/domain';
import { newId, nowIso, parseJson } from '../helpers';

interface StarterWorkOrderRow {
  id: string;
  billing_order_id: string;
  intake_id: string;
  commercial_offer_id: string;
  user_id: string;
  project_id: string | null;
  status: string;
  work_snapshot: string;
  assigned_by: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

export class LmwaresStarterWorkOrdersRepository {
  constructor(private readonly db: D1Database) {}

  async ensureFromPaidBillingOrder(billingOrderId: string): Promise<StarterWorkOrder> {
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO lmw_starter_work_orders
          (id, billing_order_id, intake_id, commercial_offer_id, user_id, status,
           work_snapshot, created_at, updated_at)
         SELECT ?, b.id, b.intake_id, b.commercial_offer_id, b.user_id,
                'awaiting_provisioning', b.order_snapshot, ?, ?
         FROM lmw_billing_orders b
         WHERE b.id = ? AND b.purpose = 'implementation' AND b.status = 'paid'
           AND b.intake_id IS NOT NULL AND b.commercial_offer_id IS NOT NULL`,
      )
      .bind(newId(), now, now, billingOrderId)
      .run();
    const workOrder = await this.getByBillingOrderId(billingOrderId);
    if (!workOrder) {
      throw new AppError('conflict', 'La orden de trabajo requiere un pago confirmado.');
    }
    return workOrder;
  }

  async getById(id: string): Promise<StarterWorkOrder | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_starter_work_orders WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<StarterWorkOrderRow>();
    return row ? mapWorkOrder(row) : null;
  }

  async getByBillingOrderId(billingOrderId: string): Promise<StarterWorkOrder | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_starter_work_orders WHERE billing_order_id = ? LIMIT 1`)
      .bind(billingOrderId)
      .first<StarterWorkOrderRow>();
    return row ? mapWorkOrder(row) : null;
  }

  async getByIntakeId(intakeId: string): Promise<StarterWorkOrder | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_starter_work_orders WHERE intake_id = ? LIMIT 1`)
      .bind(intakeId)
      .first<StarterWorkOrderRow>();
    return row ? mapWorkOrder(row) : null;
  }

  async list(input: { status?: StarterWorkOrderStatus; limit: number }): Promise<StarterWorkOrder[]> {
    const result = input.status
      ? await this.db
          .prepare(
            `SELECT * FROM lmw_starter_work_orders
             WHERE status = ? ORDER BY created_at ASC LIMIT ?`,
          )
          .bind(input.status, input.limit)
          .all<StarterWorkOrderRow>()
      : await this.db
          .prepare(`SELECT * FROM lmw_starter_work_orders ORDER BY created_at ASC LIMIT ?`)
          .bind(input.limit)
          .all<StarterWorkOrderRow>();
    return result.results.map(mapWorkOrder);
  }

  async assignProject(input: {
    id: string;
    projectId: string;
    assignedBy: string;
  }): Promise<StarterWorkOrder> {
    const current = await this.getById(input.id);
    if (!current) throw AppError.notFound('Orden de trabajo');
    if (current.status === 'canceled' || current.status === 'live') {
      throw new AppError('conflict', 'Esta orden de trabajo ya no admite cambios de proyecto.');
    }
    const project = await this.db
      .prepare(`SELECT id FROM lmwares_projects WHERE id = ? LIMIT 1`)
      .bind(input.projectId)
      .first<{ id: string }>();
    if (!project) throw AppError.notFound('Proyecto Oracle');
    if (current.projectId && current.projectId !== input.projectId) {
      throw new AppError('conflict', 'La orden ya está enlazada a otro proyecto.');
    }
    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE lmw_starter_work_orders
         SET project_id = ?, status = CASE WHEN status = 'awaiting_provisioning' THEN 'in_build' ELSE status END,
             assigned_by = COALESCE(assigned_by, ?), assigned_at = COALESCE(assigned_at, ?),
             updated_at = ?
         WHERE id = ? AND status NOT IN ('canceled', 'live')
           AND (project_id IS NULL OR project_id = ?)`,
      )
      .bind(input.projectId, input.assignedBy, now, now, input.id, input.projectId)
      .run();
    return (await this.getById(input.id))!;
  }

  async setStatus(input: {
    id: string;
    status: 'in_build' | 'client_review' | 'ready_to_publish' | 'canceled';
  }): Promise<StarterWorkOrder> {
    const current = await this.getById(input.id);
    if (!current) throw AppError.notFound('Orden de trabajo');
    if (!current.projectId && input.status !== 'canceled') {
      throw new AppError('conflict', 'Primero enlaza un proyecto real de Oracle.');
    }
    if (!allowedTransition(current.status, input.status)) {
      throw new AppError('conflict', `No se puede pasar de ${current.status} a ${input.status}.`);
    }
    const result = await this.db
      .prepare(`UPDATE lmw_starter_work_orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?`)
      .bind(input.status, nowIso(), input.id, current.status)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AppError('conflict', 'La orden cambió mientras se actualizaba.');
    }
    return (await this.getById(input.id))!;
  }
}

function allowedTransition(from: StarterWorkOrderStatus, to: StarterWorkOrderStatus): boolean {
  if (to === 'canceled') return from !== 'live' && from !== 'canceled';
  if (from === 'in_build') return to === 'client_review';
  if (from === 'client_review') return to === 'in_build' || to === 'ready_to_publish';
  if (from === 'ready_to_publish') return to === 'client_review';
  return false;
}

function mapWorkOrder(row: StarterWorkOrderRow): StarterWorkOrder {
  return {
    id: row.id,
    billingOrderId: row.billing_order_id,
    intakeId: row.intake_id,
    commercialOfferId: row.commercial_offer_id,
    userId: row.user_id,
    projectId: row.project_id,
    status: row.status as StarterWorkOrderStatus,
    workSnapshot: parseJson<Metadata>(row.work_snapshot, {}),
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
