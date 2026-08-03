import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  subscriptionStatusFromCharge,
  subscriptionStatusFromProvider,
  type MaintenanceSubscription,
  type Metadata,
  type PackageSubscriptionStatus,
} from '@starter/domain';
import { newId, nowIso, parseJson } from '../helpers';

interface MaintenanceSubscriptionRow {
  id: string;
  work_order_id: string;
  intake_id: string;
  commercial_offer_id: string;
  user_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  frequency: number;
  frequency_type: string;
  pricing_version: string;
  subscription_snapshot: string;
  provider: string;
  provider_preapproval_id: string | null;
  authorization_url: string | null;
  external_reference: string;
  provider_status: string | null;
  next_payment_date: string | null;
  last_authorized_payment_id: string | null;
  last_authorized_status: string | null;
  authorized_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceSubscriptionCreationClaim {
  subscription: MaintenanceSubscription;
  claimed: boolean;
}

export class LmwaresMaintenanceSubscriptionsRepository {
  constructor(private readonly db: D1Database) {}

  async getById(id: string): Promise<MaintenanceSubscription | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_maintenance_subscriptions WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<MaintenanceSubscriptionRow>();
    return row ? mapMaintenanceSubscription(row) : null;
  }

  async getByWorkOrderId(workOrderId: string): Promise<MaintenanceSubscription | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_maintenance_subscriptions WHERE work_order_id = ? LIMIT 1`)
      .bind(workOrderId)
      .first<MaintenanceSubscriptionRow>();
    return row ? mapMaintenanceSubscription(row) : null;
  }

  async getByExternalReference(reference: string): Promise<MaintenanceSubscription | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_maintenance_subscriptions WHERE external_reference = ? LIMIT 1`)
      .bind(reference)
      .first<MaintenanceSubscriptionRow>();
    return row ? mapMaintenanceSubscription(row) : null;
  }

  async getByProviderPreapprovalId(providerId: string): Promise<MaintenanceSubscription | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_maintenance_subscriptions WHERE provider_preapproval_id = ? LIMIT 1`)
      .bind(providerId)
      .first<MaintenanceSubscriptionRow>();
    return row ? mapMaintenanceSubscription(row) : null;
  }

  async listForUser(userId: string): Promise<MaintenanceSubscription[]> {
    const result = await this.db
      .prepare(`SELECT * FROM lmw_maintenance_subscriptions WHERE user_id = ? ORDER BY created_at DESC`)
      .bind(userId)
      .all<MaintenanceSubscriptionRow>();
    return result.results.map(mapMaintenanceSubscription);
  }

  async listForReconciliation(limit = 25): Promise<MaintenanceSubscription[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.db
      .prepare(
        `SELECT * FROM lmw_maintenance_subscriptions
         WHERE provider_preapproval_id IS NOT NULL
           AND status IN ('pending_authorization', 'active', 'payment_attention', 'paused')
         ORDER BY updated_at ASC, id ASC LIMIT ?`,
      )
      .bind(safeLimit)
      .all<MaintenanceSubscriptionRow>();
    return result.results.map(mapMaintenanceSubscription);
  }

  async claimCreation(input: {
    workOrderId: string;
    userId: string;
  }): Promise<MaintenanceSubscriptionCreationClaim> {
    const id = newId();
    const now = nowIso();
    const reference = `lmw-maintenance:${id}`;
    const inserted = await this.db
      .prepare(
        `INSERT OR IGNORE INTO lmw_maintenance_subscriptions
          (id, work_order_id, intake_id, commercial_offer_id, user_id, status,
           amount_cents, currency, frequency, frequency_type, pricing_version,
           subscription_snapshot, provider, external_reference, created_at, updated_at)
         SELECT ?, w.id, w.intake_id, w.commercial_offer_id, w.user_id, 'creating',
                o.monthly_amount_cents, o.currency, 1, 'months',
                'commercial-offer:' || o.id || ':v' || o.version,
                json_object(
                  'schema', 'lmwares.maintenance-subscription.v1',
                  'workOrderId', w.id,
                  'offerId', o.id,
                  'offerVersion', o.version,
                  'plan', o.plan,
                  'modules', json(o.modules),
                  'monthlyAmountCents', o.monthly_amount_cents,
                  'currency', o.currency,
                  'maintenanceStartPolicy', o.maintenance_start_policy,
                  'termsVersion', o.terms_version,
                  'termsSnapshot', json(o.terms_snapshot)
                ),
                'mercado_pago', ?, ?, ?
         FROM lmw_starter_work_orders w
         JOIN lmw_billing_orders b ON b.id = w.billing_order_id
         JOIN lmw_commercial_offers o ON o.id = w.commercial_offer_id
         WHERE w.id = ? AND w.user_id = ? AND w.status = 'ready_to_publish'
           AND w.project_id IS NOT NULL
           AND b.status = 'paid' AND b.payment_review_required = 0
           AND o.status = 'accepted' AND o.monthly_amount_cents > 0`,
      )
      .bind(id, reference, now, now, input.workOrderId, input.userId)
      .run();
    if ((inserted.meta.changes ?? 0) === 1) {
      return { subscription: (await this.getById(id))!, claimed: true };
    }

    let existing = await this.getByWorkOrderId(input.workOrderId);
    if (!existing || existing.userId !== input.userId) {
      throw new AppError(
        'conflict',
        'La mensualidad requiere implementación pagada y un proyecto listo para publicar.',
      );
    }
    if (existing.status === 'creation_failed' && !existing.providerPreapprovalId) {
      const retried = await this.db
        .prepare(
          `UPDATE lmw_maintenance_subscriptions
           SET status = 'creating', provider_status = NULL, updated_at = ?
           WHERE id = ? AND status = 'creation_failed' AND provider_preapproval_id IS NULL`,
        )
        .bind(now, existing.id)
        .run();
      if ((retried.meta.changes ?? 0) === 1) {
        existing = (await this.getById(existing.id))!;
        return { subscription: existing, claimed: true };
      }
    }
    return { subscription: existing, claimed: false };
  }

  async savePreapproval(input: {
    id: string;
    providerPreapprovalId: string;
    authorizationUrl: string;
    providerStatus: string;
    nextPaymentDate: string | null;
  }): Promise<MaintenanceSubscription> {
    const now = nowIso();
    const status = subscriptionStatusFromProvider(input.providerStatus);
    await this.db
      .prepare(
        `UPDATE lmw_maintenance_subscriptions
         SET status = ?, provider_preapproval_id = ?, authorization_url = ?,
             provider_status = ?, next_payment_date = ?,
             authorized_at = CASE WHEN ? = 'active' THEN COALESCE(authorized_at, ?) ELSE authorized_at END,
             canceled_at = CASE WHEN ? = 'canceled' THEN COALESCE(canceled_at, ?) ELSE canceled_at END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        status,
        input.providerPreapprovalId,
        input.authorizationUrl,
        input.providerStatus.slice(0, 80),
        input.nextPaymentDate,
        status,
        now,
        status,
        now,
        now,
        input.id,
      )
      .run();
    return (await this.getById(input.id))!;
  }

  async markCreationFailed(id: string, diagnostic: string): Promise<void> {
    const safe = /^[a-z0-9_:-]{1,80}$/.test(diagnostic) ? diagnostic : 'unexpected_error';
    await this.db
      .prepare(
        `UPDATE lmw_maintenance_subscriptions
         SET status = 'creation_failed', provider_status = ?, updated_at = ?
         WHERE id = ? AND status = 'creating' AND provider_preapproval_id IS NULL`,
      )
      .bind(`creation_error:${safe}`.slice(0, 80), nowIso(), id)
      .run();
  }

  async reconcileAuthorizedPayment(input: {
    subscriptionId: string;
    providerAuthorizedPaymentId: string;
    providerPaymentId: string | null;
    providerStatus: string;
    paymentStatus: string | null;
    summarized: string | null;
    amountCents: number;
    currency: string;
    debitDate: string | null;
    retryAttempt: number;
  }): Promise<MaintenanceSubscription> {
    const subscription = await this.getById(input.subscriptionId);
    if (!subscription) throw AppError.notFound('Suscripción de mantenimiento');
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmw_maintenance_subscription_charges
          (id, maintenance_subscription_id, provider, provider_authorized_payment_id,
           provider_payment_id, status, summarized, amount_cents, currency,
           debit_date, retry_attempt, created_at, updated_at)
         VALUES (?, ?, 'mercado_pago', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider_authorized_payment_id) DO UPDATE SET
           provider_payment_id = excluded.provider_payment_id,
           status = excluded.status,
           summarized = excluded.summarized,
           debit_date = excluded.debit_date,
           retry_attempt = excluded.retry_attempt,
           updated_at = excluded.updated_at
         WHERE lmw_maintenance_subscription_charges.maintenance_subscription_id = excluded.maintenance_subscription_id`,
      )
      .bind(
        newId(), subscription.id, input.providerAuthorizedPaymentId, input.providerPaymentId,
        input.providerStatus.slice(0, 80), input.summarized?.slice(0, 80) ?? null,
        input.amountCents, input.currency.slice(0, 12), input.debitDate,
        Math.max(0, input.retryAttempt), now, now,
      )
      .run();
    const owner = await this.db
      .prepare(
        `SELECT maintenance_subscription_id FROM lmw_maintenance_subscription_charges
         WHERE provider_authorized_payment_id = ? LIMIT 1`,
      )
      .bind(input.providerAuthorizedPaymentId)
      .first<{ maintenance_subscription_id: string }>();
    if (!owner || owner.maintenance_subscription_id !== subscription.id) {
      throw new AppError('conflict', 'El cargo ya pertenece a otra suscripción de mantenimiento.');
    }
    const status = subscriptionStatusFromCharge(
      input.providerStatus,
      input.paymentStatus,
      subscription.status,
    );
    await this.db
      .prepare(
        `UPDATE lmw_maintenance_subscriptions
         SET status = ?, last_authorized_payment_id = ?, last_authorized_status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        status,
        input.providerAuthorizedPaymentId,
        (input.paymentStatus ?? input.providerStatus).slice(0, 80),
        now,
        subscription.id,
      )
      .run();
    return (await this.getById(subscription.id))!;
  }
}

function mapMaintenanceSubscription(row: MaintenanceSubscriptionRow): MaintenanceSubscription {
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    intakeId: row.intake_id,
    commercialOfferId: row.commercial_offer_id,
    userId: row.user_id,
    status: row.status as PackageSubscriptionStatus,
    amountCents: row.amount_cents,
    currency: row.currency as 'MXN',
    frequency: 1,
    frequencyType: 'months',
    pricingVersion: row.pricing_version,
    subscriptionSnapshot: parseJson<Metadata>(row.subscription_snapshot, {}),
    provider: row.provider as 'mercado_pago',
    providerPreapprovalId: row.provider_preapproval_id,
    authorizationUrl: row.authorization_url,
    externalReference: row.external_reference,
    providerStatus: row.provider_status,
    nextPaymentDate: row.next_payment_date,
    lastAuthorizedPaymentId: row.last_authorized_payment_id,
    lastAuthorizedPaymentStatus: row.last_authorized_status,
    authorizedAt: row.authorized_at,
    canceledAt: row.canceled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
