import { Hono } from 'hono';
import { createRepositories } from '@starter/db';
import { AppError } from '@starter/domain';
import type { Bindings, Variables } from '../env';
import { requireApproval } from '../middleware/auth';

export const stuckPayments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Umbral en horas para considerar un pago "atascado": el cron de reconciliación
 * ya tuvo oportunidad de intentarlo varias veces (corre cada hora) y sigue sin
 * resolverse, así que amerita revisión humana.
 */
const STUCK_THRESHOLD_HOURS = 3;
const STUCK_DETAIL_LIMIT = 100;

export type StuckPaymentKind =
  | 'implementation_phase'
  | 'package_proposal'
  | 'package_subscription'
  | 'maintenance_subscription';

interface StuckPaymentRow {
  kind: StuckPaymentKind;
  id: string;
  phase: number | null;
  status: string;
  amount_cents: number;
  currency: string;
  updated_at: string;
  provider_status: string | null;
  provider_resource_id: string | null;
  external_reference: string | null;
  user_id: string;
  intake_id: string | null;
  work_order_id: string | null;
}

/**
 * POST /admin/stuck-payments/:kind/:id/reconcile
 *
 * Dispara bajo demanda la misma reconciliación idempotente que ya corre el
 * cron cada hora: busca en Mercado Pago el pago/cargo ya existente para ese
 * registro y lo aplica sólo si coincide con el importe/moneda/referencia
 * congelados. Nunca crea un checkout, preapproval o cobro nuevo. Requiere
 * `OPS_RECOVERY_TOKEN` configurado en ambos Workers; si falta, responde
 * `conflict` sin intentar la llamada.
 */
stuckPayments.post('/:kind/:id/reconcile', requireApproval, async (c) => {
  const admin = c.get('admin');
  const kind = c.req.param('kind') ?? '';
  const id = c.req.param('id') ?? '';
  const knownKinds = [
    'implementation_phase',
    'package_proposal',
    'package_subscription',
    'maintenance_subscription',
  ];
  if (!knownKinds.includes(kind)) {
    throw new AppError('validation_error', 'Tipo de pago desconocido.');
  }
  const token = c.env.OPS_RECOVERY_TOKEN?.trim();
  if (!token) {
    throw new AppError(
      'conflict',
      'Falta configurar OPS_RECOVERY_TOKEN en ambos Workers para habilitar esta acción.',
    );
  }
  const repos = createRepositories(c.env.DB);
  await repos.audit.record({
    actorType: 'admin',
    actorId: admin.email,
    action: 'lmwares.stuck_payment.manual_reconcile_requested',
    entityType: entityTypeForKind(kind),
    entityId: id,
    metadata: { kind },
    ip: null,
    userAgent: null,
  });
  const authHeader = ['Bearer', token].join(' ');
  const response = await fetch(`${c.env.PUBLIC_API_URL}/internal/stuck-payments/reconcile`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader,
    },
    body: JSON.stringify({ kind, id, actorEmail: admin.email }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error?: { message?: string } }).error?.message
        : null;
    throw new AppError(
      response.status === 404 ? 'not_found' : 'internal_error',
      message ?? 'No fue posible reconciliar el pago con el proveedor.',
    );
  }
  return c.json(payload);
});

function entityTypeForKind(
  kind: string,
):
  | 'lmwares_billing_order'
  | 'lmwares_package_proposal'
  | 'lmwares_subscription'
  | 'lmwares_maintenance_subscription' {
  switch (kind) {
    case 'implementation_phase':
      return 'lmwares_billing_order';
    case 'package_proposal':
      return 'lmwares_package_proposal';
    case 'package_subscription':
      return 'lmwares_subscription';
    default:
      return 'lmwares_maintenance_subscription';
  }
}

stuckPayments.get('/', async (c) => {
  const repos = createRepositories(c.env.DB);
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 3_600_000).toISOString();
  const [billingOrders, packageProposals, packageSubscriptions, maintenanceSubscriptions] =
    await Promise.all([
      repos.lmwaresBillingOrders.countStuck(STUCK_THRESHOLD_HOURS),
      repos.lmwaresPayments.countStuck(STUCK_THRESHOLD_HOURS),
      repos.lmwaresSubscriptions.countStuck(STUCK_THRESHOLD_HOURS),
      repos.lmwaresMaintenanceSubscriptions.countStuck(STUCK_THRESHOLD_HOURS),
    ]);
  const detail = await c.env.DB.prepare(
    `SELECT * FROM (
       SELECT 'implementation_phase' AS kind, id, phase, status, amount_cents, currency,
              updated_at, last_provider_status AS provider_status,
              COALESCE(provider_payment_id, provider_preference_id) AS provider_resource_id,
              external_reference, user_id, intake_id, NULL AS work_order_id
       FROM lmw_billing_orders
       WHERE purpose = 'implementation'
         AND status IN ('checkout_creating', 'payment_pending', 'payment_failed')
         AND updated_at < ?
       UNION ALL
       SELECT 'package_proposal' AS kind, id, NULL AS phase, status, amount_cents, currency,
              updated_at, last_provider_status AS provider_status,
              COALESCE(provider_payment_id, provider_preference_id) AS provider_resource_id,
              id AS external_reference, user_id, NULL AS intake_id, NULL AS work_order_id
       FROM lmw_package_proposals
       WHERE status IN ('checkout_creating', 'payment_pending', 'payment_failed')
         AND updated_at < ?
       UNION ALL
       SELECT 'package_subscription' AS kind, id, NULL AS phase, status, amount_cents, currency,
              updated_at, provider_status,
              COALESCE(provider_preapproval_id, external_reference) AS provider_resource_id,
              external_reference, user_id, NULL AS intake_id, NULL AS work_order_id
       FROM lmw_subscriptions
       WHERE status IN ('pending_authorization', 'payment_attention')
         AND updated_at < ?
       UNION ALL
       SELECT 'maintenance_subscription' AS kind, id, NULL AS phase, status, amount_cents, currency,
              updated_at, provider_status,
              COALESCE(provider_preapproval_id, external_reference) AS provider_resource_id,
              external_reference, user_id, NULL AS intake_id, work_order_id
       FROM lmw_maintenance_subscriptions
       WHERE status IN ('pending_authorization', 'payment_attention')
         AND updated_at < ?
     ) AS stuck
     ORDER BY updated_at ASC, id ASC
     LIMIT ?`,
  )
    .bind(cutoff, cutoff, cutoff, cutoff, STUCK_DETAIL_LIMIT)
    .all<StuckPaymentRow>();
  const total = billingOrders + packageProposals + packageSubscriptions + maintenanceSubscriptions;
  return c.json({
    total,
    thresholdHours: STUCK_THRESHOLD_HOURS,
    items: detail.results.map((row) => ({
      kind: row.kind,
      id: row.id,
      phase: row.phase,
      status: row.status,
      amountCents: row.amount_cents,
      currency: row.currency,
      updatedAt: row.updated_at,
      ageMinutes: Math.max(0, Math.floor((Date.now() - Date.parse(row.updated_at)) / 60_000)),
      providerStatus: row.provider_status,
      providerResourceId: row.provider_resource_id,
      externalReference: row.external_reference,
      userId: row.user_id,
      intakeId: row.intake_id,
      workOrderId: row.work_order_id,
    })),
    byType: {
      billingOrders,
      packageProposals,
      packageSubscriptions,
      maintenanceSubscriptions,
    },
  });
});
