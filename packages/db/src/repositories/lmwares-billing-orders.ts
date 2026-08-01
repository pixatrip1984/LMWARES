import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  decidePaymentPolicy,
  type BillingOrder,
  type BillingOrderStatus,
  type Metadata,
  type PaymentAttemptDisposition,
} from '@starter/domain';
import { boolFromDb, newId, nowIso, parseJson } from '../helpers';
import { LmwaresStarterWorkOrdersRepository } from './lmwares-starter-work-orders';

interface BillingOrderRow {
  id: string;
  purpose: string;
  commercial_offer_id: string | null;
  intake_id: string | null;
  user_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  order_snapshot: string;
  external_reference: string;
  provider: string;
  provider_preference_id: string | null;
  provider_payment_id: string | null;
  checkout_url: string | null;
  checkout_expires_at: string | null;
  last_provider_status: string | null;
  payment_review_required: number;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BillingOrderRecoveryRow extends BillingOrderRow {
  offer_status: string;
  intake_status: string;
  work_order_id: string | null;
}

export interface BillingOrderReconciliationResult {
  order: BillingOrder;
  disposition: PaymentAttemptDisposition;
  duplicatePayment: boolean;
}

export class LmwaresBillingOrdersRepository {
  constructor(private readonly db: D1Database) {}

  async ensureImplementationOrder(input: {
    offerId: string;
    intakeId: string;
    userId: string;
  }): Promise<BillingOrder> {
    const existing = await this.getByOfferId(input.offerId);
    if (existing) {
      if (existing.userId !== input.userId || existing.intakeId !== input.intakeId) {
        throw new AppError('conflict', 'La orden de implementación no coincide con la solicitud.');
      }
      return existing;
    }

    const id = newId();
    const now = nowIso();
    const externalReference = `lmw-implementation:${id}`;
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO lmw_billing_orders
          (id, purpose, commercial_offer_id, intake_id, user_id, status,
           amount_cents, currency, order_snapshot, external_reference, provider,
           created_at, updated_at)
         SELECT ?, 'implementation', o.id, o.intake_id, o.user_id, 'ready',
                o.implementation_amount_cents, o.currency,
                json_object(
                  'schema', 'lmwares.billing-order.implementation.v1',
                  'offerId', o.id,
                  'offerVersion', o.version,
                  'plan', o.plan,
                  'modules', json(o.modules),
                  'marketing', json(CASE o.marketing WHEN 1 THEN 'true' ELSE 'false' END),
                  'scopeSummary', o.scope_summary,
                  'implementationDescription', o.implementation_description,
                  'termsVersion', o.terms_version,
                  'termsSnapshot', json(o.terms_snapshot)
                ),
                ?, 'mercado_pago', ?, ?
         FROM lmw_commercial_offers o
         WHERE o.id = ? AND o.intake_id = ? AND o.user_id = ? AND o.status = 'accepted'`,
      )
      .bind(
        id,
        externalReference,
        now,
        now,
        input.offerId,
        input.intakeId,
        input.userId,
      )
      .run();

    const order = await this.getByOfferId(input.offerId);
    if (!order || order.userId !== input.userId) {
      throw new AppError('conflict', 'La oferta debe estar aceptada antes de preparar el pago.');
    }
    return order;
  }

  async getById(id: string): Promise<BillingOrder | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_billing_orders WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<BillingOrderRow>();
    return row ? mapBillingOrder(row) : null;
  }

  async getByOfferId(offerId: string): Promise<BillingOrder | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_billing_orders WHERE commercial_offer_id = ? LIMIT 1`)
      .bind(offerId)
      .first<BillingOrderRow>();
    return row ? mapBillingOrder(row) : null;
  }

  async getByExternalReference(reference: string): Promise<BillingOrder | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_billing_orders WHERE external_reference = ? LIMIT 1`)
      .bind(reference)
      .first<BillingOrderRow>();
    return row ? mapBillingOrder(row) : null;
  }

  async listForUser(userId: string): Promise<BillingOrder[]> {
    const result = await this.db
      .prepare(`SELECT * FROM lmw_billing_orders WHERE user_id = ? ORDER BY created_at DESC`)
      .bind(userId)
      .all<BillingOrderRow>();
    return result.results.map(mapBillingOrder);
  }

  async claimCheckout(id: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE lmw_billing_orders
         SET status = 'checkout_creating', updated_at = ?
         WHERE id = ? AND provider_preference_id IS NULL
           AND status IN ('ready', 'checkout_failed')
           AND payment_review_required = 0`,
      )
      .bind(nowIso(), id)
      .run();
    return (result.meta.changes ?? 0) === 1;
  }

  async saveCheckout(input: {
    id: string;
    preferenceId: string;
    checkoutUrl: string;
    checkoutExpiresAt: string;
  }): Promise<BillingOrder> {
    const result = await this.db
      .prepare(
        `UPDATE lmw_billing_orders
         SET status = 'payment_pending', provider_preference_id = ?, checkout_url = ?,
             checkout_expires_at = ?, last_provider_status = 'preference_created', updated_at = ?
         WHERE id = ? AND status = 'checkout_creating'`,
      )
      .bind(
        input.preferenceId,
        input.checkoutUrl,
        input.checkoutExpiresAt,
        nowIso(),
        input.id,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AppError('conflict', 'La orden cambió mientras se preparaba el checkout.');
    }
    return (await this.getById(input.id))!;
  }

  async markCheckoutFailed(id: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE lmw_billing_orders SET status = 'checkout_failed', updated_at = ?
         WHERE id = ? AND status = 'checkout_creating'`,
      )
      .bind(nowIso(), id)
      .run();
  }

  async cancelExpiredImplementationAndReopen(input: {
    intakeId: string;
  }): Promise<{ order: BillingOrder; changed: boolean }> {
    const current = await this.db
      .prepare(
        `SELECT bo.*, o.status AS offer_status, i.status AS intake_status,
                w.id AS work_order_id
         FROM lmw_billing_orders bo
         JOIN lmw_commercial_offers o ON o.id = bo.commercial_offer_id
         JOIN lmw_package_intakes i ON i.id = bo.intake_id
         LEFT JOIN lmw_starter_work_orders w ON w.billing_order_id = bo.id
         WHERE bo.intake_id = ? AND bo.purpose = 'implementation'
         ORDER BY bo.created_at DESC LIMIT 1`,
      )
      .bind(input.intakeId)
      .first<BillingOrderRecoveryRow>();
    if (!current) throw AppError.notFound('Orden de implementación');

    if (
      current.status === 'canceled' &&
      current.offer_status === 'superseded' &&
      current.intake_status === 'scope_review'
    ) {
      return { order: mapBillingOrder(current), changed: false };
    }
    if (current.work_order_id) {
      throw new AppError('conflict', 'La implementación ya tiene una orden de trabajo y no puede reabrirse.');
    }
    if (current.provider_payment_id || current.paid_at || current.payment_review_required === 1) {
      throw new AppError('conflict', 'La orden tiene un pago o una revisión pendiente y no puede cancelarse.');
    }
    if (!['ready', 'checkout_failed', 'payment_pending', 'payment_failed'].includes(current.status)) {
      throw new AppError('conflict', 'La orden ya no admite una revisión de la oferta.');
    }
    if (current.offer_status !== 'accepted' || current.intake_status !== 'offer_ready') {
      throw new AppError('conflict', 'La oferta o la solicitud cambiaron y ya no pueden reabrirse.');
    }
    if (current.provider_preference_id) {
      const checkoutExpiresAt = current.checkout_expires_at
        ? Date.parse(current.checkout_expires_at)
        : Number.NaN;
      if (!Number.isFinite(checkoutExpiresAt) || checkoutExpiresAt > Date.now()) {
        throw new AppError(
          'conflict',
          'El checkout aún está vigente. Espera a que venza antes de reabrir la oferta.',
        );
      }
    }

    const now = nowIso();
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmw_billing_orders
           SET status = 'canceled', last_provider_status = 'checkout_expired_reopened',
               checkout_url = NULL, updated_at = ?
           WHERE id = ? AND purpose = 'implementation'
             AND status IN ('ready', 'checkout_failed', 'payment_pending', 'payment_failed')
             AND provider_payment_id IS NULL AND paid_at IS NULL
             AND payment_review_required = 0
             AND NOT EXISTS (
               SELECT 1 FROM lmw_starter_work_orders WHERE billing_order_id = ?
             )`,
        )
        .bind(now, current.id, current.id),
      this.db
        .prepare(
          `UPDATE lmw_commercial_offers
           SET status = 'superseded', updated_at = ?
           WHERE id = ? AND status = 'accepted'
             AND EXISTS (
               SELECT 1 FROM lmw_billing_orders
               WHERE id = ? AND status = 'canceled' AND provider_payment_id IS NULL
             )`,
        )
        .bind(now, current.commercial_offer_id, current.id),
      this.db
        .prepare(
          `UPDATE lmw_package_intakes
           SET status = 'scope_review', updated_at = ?
           WHERE id = ? AND status = 'offer_ready'
             AND EXISTS (
               SELECT 1 FROM lmw_commercial_offers
               WHERE id = ? AND status = 'superseded'
             )
             AND EXISTS (
               SELECT 1 FROM lmw_billing_orders
               WHERE id = ? AND status = 'canceled' AND provider_payment_id IS NULL
             )`,
        )
        .bind(now, current.intake_id, current.commercial_offer_id, current.id),
    ]);
    if (results.some((result) => (result.meta.changes ?? 0) !== 1)) {
      throw new AppError('conflict', 'La orden cambió mientras se reabría la oferta.');
    }
    return { order: (await this.getById(current.id))!, changed: true };
  }

  async reconcilePayment(input: {
    id: string;
    paymentId: string;
    providerStatus: string;
    amountCents: number;
    currency: string;
    providerCreatedAt: string | null;
  }): Promise<BillingOrderReconciliationResult> {
    const now = nowIso();
    const before = await this.getById(input.id);
    if (!before) throw AppError.notFound('Orden de pago');

    await this.db
      .prepare(
        `INSERT INTO lmw_billing_payment_attempts
          (id, billing_order_id, provider, provider_payment_id, provider_preference_id,
           provider_status, disposition, amount_cents, currency, provider_created_at,
           first_seen_at, updated_at)
         VALUES (?, ?, 'mercado_pago', ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
         ON CONFLICT(provider_payment_id) DO UPDATE SET
           provider_status = excluded.provider_status,
           provider_created_at = COALESCE(lmw_billing_payment_attempts.provider_created_at, excluded.provider_created_at),
           updated_at = excluded.updated_at
         WHERE lmw_billing_payment_attempts.billing_order_id = excluded.billing_order_id`,
      )
      .bind(
        newId(),
        input.id,
        input.paymentId,
        before.providerPreferenceId,
        input.providerStatus.slice(0, 80),
        input.amountCents,
        input.currency.slice(0, 12),
        input.providerCreatedAt,
        now,
        now,
      )
      .run();

    const owner = await this.db
      .prepare(`SELECT billing_order_id FROM lmw_billing_payment_attempts WHERE provider_payment_id = ? LIMIT 1`)
      .bind(input.paymentId)
      .first<{ billing_order_id: string }>();
    if (!owner || owner.billing_order_id !== input.id) {
      throw new AppError('conflict', 'El pago ya pertenece a otra orden.');
    }

    if (input.providerStatus === 'approved') {
      await this.db
        .prepare(
          `UPDATE lmw_billing_orders
           SET status = 'paid', provider_payment_id = ?, last_provider_status = ?,
               paid_at = COALESCE(paid_at, ?), updated_at = ?
           WHERE id = ? AND (provider_payment_id IS NULL OR provider_payment_id = ?)`,
        )
        .bind(input.paymentId, input.providerStatus, input.providerCreatedAt ?? now, now, input.id, input.paymentId)
        .run();
      const paidOrder = await this.getById(input.id);
      if (paidOrder?.status === 'paid' && paidOrder.intakeId) {
        await this.db.batch([
          this.db
            .prepare(
              `UPDATE lmw_package_intakes
               SET status = 'converted', updated_at = ?
               WHERE id = ? AND user_id = ? AND status = 'offer_ready'`,
            )
            .bind(now, paidOrder.intakeId, paidOrder.userId),
          this.db
            .prepare(
              `INSERT OR IGNORE INTO lmw_notifications
                (id, user_id, intake_id, channel, template, to_address, dedupe_key,
                 status, attempt, max_attempts, payload, sent_at, created_at, updated_at)
               SELECT ?, u.id, NULL, 'in_app', 'implementation-payment-confirmed', u.email, ?,
                      'sent', 0, 1, ?, ?, ?, ?
               FROM lmw_users u WHERE u.id = ?`,
            )
            .bind(
              newId(),
              `implementation-payment-confirmed:${paidOrder.id}`,
              JSON.stringify({
                kind: 'implementation-payment-confirmed',
                billingOrderId: paidOrder.id,
                intakeId: paidOrder.intakeId,
                offerId: paidOrder.commercialOfferId,
                amountCents: paidOrder.amountCents,
                currency: paidOrder.currency,
                providerPaymentId: input.paymentId,
              }),
              now,
              now,
              now,
              paidOrder.userId,
            ),
        ]);
        await new LmwaresStarterWorkOrdersRepository(this.db).ensureFromPaidBillingOrder(
          paidOrder.id,
        );
      }
    }

    let order = (await this.getById(input.id))!;
    const decision = decidePaymentPolicy({
      providerStatus: input.providerStatus,
      canonicalPaymentId: order.providerPaymentId,
      incomingPaymentId: input.paymentId,
    });
    if (decision.reviewRequired) {
      await this.db
        .prepare(`UPDATE lmw_billing_orders SET payment_review_required = 1, updated_at = ? WHERE id = ?`)
        .bind(now, input.id)
        .run();
    } else if (input.providerStatus !== 'approved' && decision.affectsProposal) {
      const status: BillingOrderStatus =
        input.providerStatus === 'refunded'
          ? 'refunded'
          : input.providerStatus === 'charged_back'
            ? 'charged_back'
            : decision.proposalStatus;
      await this.db
        .prepare(
          `UPDATE lmw_billing_orders
           SET status = ?, last_provider_status = ?, updated_at = ?
           WHERE id = ? AND (provider_payment_id = ? OR (provider_payment_id IS NULL AND status <> 'paid'))`,
        )
        .bind(status, input.providerStatus, now, input.id, input.paymentId)
        .run();
    }

    await this.db
      .prepare(
        `UPDATE lmw_billing_payment_attempts
         SET disposition = ?, provider_status = ?, updated_at = ?
         WHERE provider_payment_id = ? AND billing_order_id = ?`,
      )
      .bind(decision.disposition, input.providerStatus.slice(0, 80), now, input.paymentId, input.id)
      .run();
    order = (await this.getById(input.id))!;
    return { order, disposition: decision.disposition, duplicatePayment: decision.reviewRequired };
  }
}

function mapBillingOrder(row: BillingOrderRow): BillingOrder {
  return {
    id: row.id,
    purpose: row.purpose as BillingOrder['purpose'],
    commercialOfferId: row.commercial_offer_id,
    intakeId: row.intake_id,
    userId: row.user_id,
    status: row.status as BillingOrderStatus,
    amountCents: row.amount_cents,
    currency: row.currency as 'MXN',
    orderSnapshot: parseJson<Metadata>(row.order_snapshot, {}),
    externalReference: row.external_reference,
    provider: row.provider as 'mercado_pago',
    providerPreferenceId: row.provider_preference_id,
    providerPaymentId: row.provider_payment_id,
    checkoutUrl: row.checkout_url,
    checkoutExpiresAt: row.checkout_expires_at,
    lastProviderStatus: row.last_provider_status,
    paymentReviewRequired: boolFromDb(row.payment_review_required),
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
