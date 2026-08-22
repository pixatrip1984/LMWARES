import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  decidePaymentPolicy,
  IMPLEMENTATION_PAYMENT_PHASE_COUNT,
  splitImplementationIntoPhases,
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
  phase: number;
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
  pending_payment_attempts: number;
}

export interface BillingOrderReconciliationResult {
  order: BillingOrder;
  disposition: PaymentAttemptDisposition;
  duplicatePayment: boolean;
}

export class LmwaresBillingOrdersRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Crea, si aún no existen, las 4 órdenes de pago de implementación (fases
   * del 25%) para una oferta aceptada. Es idempotente: si ya existen se
   * devuelven tal cual, ordenadas por fase. El cliente puede pagarlas en
   * orden o adelantar una fase posterior; ninguna fase exige a las demás.
   */
  async ensureImplementationPhases(input: {
    offerId: string;
    intakeId: string;
    userId: string;
  }): Promise<BillingOrder[]> {
    const existing = await this.getPhasesForOffer(input.offerId);
    const offer = await this.db
      .prepare(
        `SELECT id, intake_id, user_id, version, plan, modules, marketing, currency,
                scope_summary, implementation_description, terms_version, terms_snapshot,
                implementation_amount_cents
         FROM lmw_commercial_offers
         WHERE id = ? AND intake_id = ? AND user_id = ? AND status = 'accepted'`,
      )
      .bind(input.offerId, input.intakeId, input.userId)
      .first<{
        id: string;
        intake_id: string;
        user_id: string;
        version: number;
        plan: string;
        modules: string;
        marketing: number;
        currency: string;
        scope_summary: string;
        implementation_description: string;
        terms_version: string;
        terms_snapshot: string;
        implementation_amount_cents: number;
      }>();
    if (!offer) {
      throw new AppError('conflict', 'La oferta debe estar aceptada antes de preparar el pago.');
    }

    const singleExisting = existing.length === 1 ? existing[0] : undefined;
    const legacySinglePhase =
      singleExisting?.phase === 1 &&
      singleExisting.amountCents === offer.implementation_amount_cents &&
      singleExisting.currency === offer.currency;
    // Las ofertas históricas podían ser inferiores al mínimo actual de cuatro
    // fases. Si ya tienen su orden única válida, se conserva antes de intentar
    // dividir el importe con las reglas nuevas.
    if (legacySinglePhase && singleExisting) {
      if (
        singleExisting.userId !== input.userId ||
        singleExisting.intakeId !== input.intakeId
      ) {
        throw new AppError('conflict', 'La orden de implementación no coincide con la oferta congelada.');
      }
      return existing;
    }

    const phases = splitImplementationIntoPhases(offer.implementation_amount_cents);
    const expectedByPhase = new Map(phases.map((phase) => [phase.phase, phase.amountCents]));
    const mismatched = existing.find((order) => {
      const expectedAmount = expectedByPhase.get(order.phase);
      return (
        order.userId !== input.userId ||
        order.intakeId !== input.intakeId ||
        expectedAmount === undefined ||
        order.amountCents !== expectedAmount ||
        order.currency !== offer.currency
      );
    });
    if (mismatched) {
      throw new AppError('conflict', 'La orden de implementación no coincide con la oferta congelada.');
    }

    if (existing.length === IMPLEMENTATION_PAYMENT_PHASE_COUNT) return existing;

    const now = nowIso();
    const statements = phases
      .filter((share) => !existing.some((order) => order.phase === share.phase))
      .map((share) => {
        const id = newId();
        const externalReference = `lmw-implementation:${id}`;
        return this.db
          .prepare(
            `INSERT OR IGNORE INTO lmw_billing_orders
              (id, purpose, commercial_offer_id, intake_id, user_id, status, phase,
               amount_cents, currency, order_snapshot, external_reference, provider,
               created_at, updated_at)
             VALUES (?, 'implementation', ?, ?, ?, 'ready', ?, ?, ?, ?, ?, 'mercado_pago', ?, ?)`,
          )
          .bind(
            id,
            offer.id,
            offer.intake_id,
            offer.user_id,
            share.phase,
            share.amountCents,
            offer.currency,
            JSON.stringify({
              schema: 'lmwares.billing-order.implementation.v1',
              offerId: offer.id,
              offerVersion: offer.version,
              plan: offer.plan,
              modules: JSON.parse(offer.modules),
              marketing: Boolean(offer.marketing),
              scopeSummary: offer.scope_summary,
              implementationDescription: offer.implementation_description,
              termsVersion: offer.terms_version,
              termsSnapshot: JSON.parse(offer.terms_snapshot),
              phase: share.phase,
              phaseCount: IMPLEMENTATION_PAYMENT_PHASE_COUNT,
            }),
            externalReference,
            now,
            now,
          );
      });
    if (statements.length > 0) await this.db.batch(statements);

    const created = await this.getPhasesForOffer(input.offerId);
    if (created.length !== IMPLEMENTATION_PAYMENT_PHASE_COUNT) {
      throw new AppError('conflict', 'La oferta debe estar aceptada antes de preparar el pago.');
    }
    return created;
  }

  async getPhasesForOffer(offerId: string): Promise<BillingOrder[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM lmw_billing_orders
         WHERE commercial_offer_id = ? AND purpose = 'implementation'
         ORDER BY phase ASC`,
      )
      .bind(offerId)
      .all<BillingOrderRow>();
    return result.results.map(mapBillingOrder);
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

  /** Creates one immutable MXN $600 domain order per project/hostname. */
  async ensureDomainOrder(input: { clientProjectId: string; userId: string; hostname: string }): Promise<BillingOrder> {
    const previousDomain = await this.db
      .prepare(`SELECT id FROM lmw_custom_domains WHERE client_project_id = ? AND type = 'apex' LIMIT 1`)
      .bind(input.clientProjectId)
      .first<{ id: string }>();
    if (previousDomain) throw new AppError('conflict', 'Este proyecto ya consumió su compra de dominio; retirarlo no restablece la cuota.');
    const existing = await this.db
      .prepare(`SELECT * FROM lmw_billing_orders WHERE purpose = 'domain' AND user_id = ? AND json_extract(order_snapshot, '$.clientProjectId') = ? LIMIT 1`)
      .bind(input.userId, input.clientProjectId)
      .first<BillingOrderRow>();
    if (existing) {
      const snapshot = parseJson<Metadata>(existing.order_snapshot, {});
      if (snapshot.hostname !== input.hostname) throw new AppError('conflict', 'El checkout de dominio ya congeló otro hostname para este proyecto.');
      return mapBillingOrder(existing);
    }
    const id = newId();
    const now = nowIso();
    await this.db.prepare(
      `INSERT INTO lmw_billing_orders (id, purpose, commercial_offer_id, intake_id, user_id, status, phase, amount_cents, currency, order_snapshot, external_reference, provider, created_at, updated_at)
       VALUES (?, 'domain', NULL, NULL, ?, 'ready', 1, 60000, 'MXN', ?, ?, 'mercado_pago', ?, ?)`
    ).bind(id, input.userId, JSON.stringify({ schema: 'lmwares.billing-order.domain.v1', clientProjectId: input.clientProjectId, hostname: input.hostname, years: 1, amountCents: 60000 }), `lmw-domain:${id}`, now, now).run();
    return (await this.getById(id))!;
  }

  async listForUser(userId: string): Promise<BillingOrder[]> {
    const result = await this.db
      .prepare(`SELECT * FROM lmw_billing_orders WHERE user_id = ? ORDER BY created_at DESC`)
      .bind(userId)
      .all<BillingOrderRow>();
    return result.results.map(mapBillingOrder);
  }

  async listForReconciliation(limit = 25): Promise<BillingOrder[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.db
      .prepare(
        `SELECT * FROM lmw_billing_orders
         WHERE provider_preference_id IS NOT NULL
           AND status IN ('checkout_creating', 'payment_pending', 'payment_failed')
         ORDER BY updated_at ASC, id ASC LIMIT ?`,
      )
      .bind(safeLimit)
      .all<BillingOrderRow>();
    return result.results.map(mapBillingOrder);
  }

  async countStuck(olderThanHours: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 3_600_000).toISOString();
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) as count FROM lmw_billing_orders
         WHERE status IN ('checkout_creating', 'payment_pending', 'payment_failed')
           AND updated_at < ?`,
      )
      .bind(cutoff)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async claimCheckout(id: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE lmw_billing_orders
         SET status = 'checkout_creating', provider_preference_id = NULL, checkout_url = NULL, updated_at = ?
         WHERE id = ?
           AND status IN ('ready', 'checkout_failed', 'payment_failed')
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
                w.id AS work_order_id,
                (SELECT COUNT(*) FROM lmw_billing_payment_attempts pa
                 WHERE pa.billing_order_id = bo.id AND pa.disposition = 'pending')
                  AS pending_payment_attempts
         FROM lmw_billing_orders bo
         JOIN lmw_commercial_offers o ON o.id = bo.commercial_offer_id
         JOIN lmw_package_intakes i ON i.id = bo.intake_id
         LEFT JOIN lmw_starter_work_orders w ON w.billing_order_id = bo.id
         WHERE bo.intake_id = ? AND bo.purpose = 'implementation' AND bo.phase = 1
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
    if (current.pending_payment_attempts > 0) {
      throw new AppError(
        'conflict',
        'La orden tiene una transferencia pendiente. Espera su resolución antes de emitir otra oferta.',
      );
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
    // Un cliente puede haber adelantado el pago de una fase posterior (2-4)
    // antes de completar la fase 1; en ese caso la oferta ya no puede
    // reabrirse sin intervención manual, porque hay dinero real comprometido.
    const paidOrPendingSiblingPhase = await this.db
      .prepare(
        `SELECT id FROM lmw_billing_orders
         WHERE commercial_offer_id = ? AND purpose = 'implementation' AND id <> ?
           AND (status = 'paid' OR payment_review_required = 1 OR provider_payment_id IS NOT NULL
                OR EXISTS (
                  SELECT 1 FROM lmw_billing_payment_attempts pa
                  WHERE pa.billing_order_id = lmw_billing_orders.id AND pa.disposition = 'pending'
                ))
         LIMIT 1`,
      )
      .bind(current.commercial_offer_id, current.id)
      .first<{ id: string }>();
    if (paidOrPendingSiblingPhase) {
      throw new AppError(
        'conflict',
        'Otra fase de esta oferta ya tiene un pago registrado y no puede reabrirse automáticamente.',
      );
    }

    const now = nowIso();
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE lmw_billing_orders
           SET status = 'canceled', last_provider_status = 'checkout_expired_reopened',
               checkout_url = NULL, updated_at = ?
           WHERE commercial_offer_id = ? AND purpose = 'implementation'
             AND status IN ('ready', 'checkout_failed', 'payment_pending', 'payment_failed')
             AND provider_payment_id IS NULL AND paid_at IS NULL
             AND payment_review_required = 0
             AND NOT EXISTS (
               SELECT 1 FROM lmw_billing_payment_attempts
               WHERE billing_order_id = lmw_billing_orders.id AND disposition = 'pending'
             )
             AND NOT EXISTS (
               SELECT 1 FROM lmw_starter_work_orders WHERE billing_order_id = lmw_billing_orders.id
             )`,
        )
        .bind(now, current.commercial_offer_id),
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
    if (results.some((result) => (result.meta.changes ?? 0) < 1)) {
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
      const paidSibling = before.intakeId
        ? await this.db
            .prepare(
              `SELECT id FROM lmw_billing_orders
               WHERE intake_id = ? AND purpose = 'implementation' AND id <> ?
                 AND (commercial_offer_id IS NULL OR commercial_offer_id <> ?)
                 AND status = 'paid'
               LIMIT 1`,
            )
            .bind(before.intakeId, input.id, before.commercialOfferId)
            .first<{ id: string }>()
        : null;
      await this.db
        .prepare(
          `UPDATE lmw_billing_orders
           SET status = 'paid', provider_payment_id = ?, last_provider_status = ?,
               payment_review_required = CASE WHEN ? THEN 1 ELSE payment_review_required END,
               paid_at = COALESCE(paid_at, ?), updated_at = ?
           WHERE id = ? AND (provider_payment_id IS NULL OR provider_payment_id = ?)`,
        )
        .bind(
          input.paymentId,
          input.providerStatus,
          paidSibling ? 1 : 0,
          input.providerCreatedAt ?? now,
          now,
          input.id,
          input.paymentId,
        )
        .run();
      const paidOrder = await this.getById(input.id);
      if (paidSibling) {
        await this.db
          .prepare(
            `UPDATE lmw_billing_payment_attempts
             SET disposition = 'duplicate_review', provider_status = ?, updated_at = ?
             WHERE provider_payment_id = ? AND billing_order_id = ?`,
          )
          .bind(input.providerStatus.slice(0, 80), now, input.paymentId, input.id)
          .run();
        return {
          order: (await this.getById(input.id))!,
          disposition: 'duplicate_review',
          duplicatePayment: true,
        };
      }
      if (
        paidOrder?.status === 'paid' &&
        paidOrder.intakeId &&
        paidOrder.commercialOfferId
      ) {
        const paymentNotification = this.db
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
          );

        if (paidOrder.phase === 1) {
          await this.db.batch([
            this.db
              .prepare(
                `UPDATE lmw_commercial_offers
                 SET status = 'superseded', updated_at = ?
                 WHERE intake_id = ? AND id <> ? AND status IN ('issued', 'accepted')`,
              )
              .bind(now, paidOrder.intakeId, paidOrder.commercialOfferId),
            this.db
              .prepare(
                `UPDATE lmw_commercial_offers
                 SET status = 'accepted', updated_at = ?
                 WHERE id = ? AND status IN ('accepted', 'superseded')`,
              )
              .bind(now, paidOrder.commercialOfferId),
            this.db
              .prepare(
                `UPDATE lmw_package_intakes
                 SET status = 'converted', updated_at = ?
                 WHERE id = ? AND user_id = ? AND status = 'offer_ready'`,
              )
              .bind(now, paidOrder.intakeId, paidOrder.userId),
            this.db
              .prepare(
                `UPDATE lmw_billing_orders
                 SET status = 'canceled', checkout_url = NULL,
                     last_provider_status = 'superseded_by_confirmed_payment', updated_at = ?
                 WHERE intake_id = ? AND purpose = 'implementation' AND id <> ?
                   AND (commercial_offer_id IS NULL OR commercial_offer_id <> ?)
                   AND status IN ('ready', 'checkout_creating', 'checkout_failed',
                                  'payment_pending', 'payment_failed')
                   AND provider_payment_id IS NULL AND paid_at IS NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM lmw_billing_payment_attempts pa
                     WHERE pa.billing_order_id = lmw_billing_orders.id
                       AND pa.disposition = 'pending'
                   )`,
              )
              .bind(now, paidOrder.intakeId, paidOrder.id, paidOrder.commercialOfferId),
            this.db
              .prepare(
                `UPDATE lmw_billing_orders
                 SET payment_review_required = 1,
                     last_provider_status = 'parallel_payment_pending_after_other_paid',
                     updated_at = ?
                 WHERE intake_id = ? AND purpose = 'implementation' AND id <> ?
                   AND (commercial_offer_id IS NULL OR commercial_offer_id <> ?)
                   AND status IN ('ready', 'checkout_creating', 'checkout_failed',
                                  'payment_pending', 'payment_failed')
                   AND provider_payment_id IS NULL AND paid_at IS NULL
                   AND EXISTS (
                     SELECT 1 FROM lmw_billing_payment_attempts pa
                     WHERE pa.billing_order_id = lmw_billing_orders.id
                       AND pa.disposition = 'pending'
                   )`,
              )
              .bind(now, paidOrder.intakeId, paidOrder.id, paidOrder.commercialOfferId),
            paymentNotification,
          ]);
          // Sólo la fase 1 crea la orden de trabajo y el proyecto Starter. Las
          // fases 2-4 pueden pagarse fuera de orden y sólo confirman su pago.
          await new LmwaresStarterWorkOrdersRepository(this.db).ensureFromPaidBillingOrder(
            paidOrder.id,
          );
        } else {
          // Un pago adelantado no convierte el intake ni supersede ofertas:
          // todavía no existe una orden de trabajo que el cliente pueda revisar.
          await paymentNotification.run();
        }
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
    phase: (row.phase as 1 | 2 | 3 | 4) ?? 1,
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
