import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  decidePaymentPolicy,
  type Metadata,
  type PackageProposal,
  type PackageProposalStatus,
  type PaymentAttemptDisposition,
  type PaidPackageModuleId,
  type PaidPackagePlan,
} from '@starter/domain';
import { boolFromDb, boolToDb, newId, nowIso, parseJson } from '../helpers';

interface PackageProposalRow {
  id: string;
  user_id: string;
  plan: string;
  modules: string;
  marketing: number;
  status: string;
  amount_cents: number;
  currency: string;
  pricing_version: string;
  package_snapshot: string;
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

interface PaymentAttemptOwnerRow {
  proposal_id: string;
}

export interface PaymentReconciliationResult {
  proposal: PackageProposal;
  disposition: PaymentAttemptDisposition;
  duplicatePayment: boolean;
}

export class LmwaresPaymentsRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: {
    userId: string;
    plan: PaidPackagePlan;
    modules: PaidPackageModuleId[];
    marketing: boolean;
    amountCents: number;
    currency: 'MXN';
    pricingVersion: string;
    packageSnapshot: Metadata;
  }): Promise<PackageProposal> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmw_package_proposals
          (id, user_id, plan, modules, marketing, status, amount_cents, currency,
           pricing_version, package_snapshot, provider, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'approved_test', ?, ?, ?, ?, 'mercado_pago', ?, ?)`,
      )
      .bind(
        id,
        input.userId,
        input.plan,
        JSON.stringify(input.modules),
        boolToDb(input.marketing),
        input.amountCents,
        input.currency,
        input.pricingVersion,
        JSON.stringify(input.packageSnapshot),
        now,
        now,
      )
      .run();
    return (await this.getById(id))!;
  }

  async getById(id: string): Promise<PackageProposal | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_package_proposals WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<PackageProposalRow>();
    return row ? mapPackageProposal(row) : null;
  }

  async claimCheckout(id: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE lmw_package_proposals
         SET status = 'checkout_creating', updated_at = ?
         WHERE id = ?
           AND provider_preference_id IS NULL
           AND status IN ('approved_test', 'checkout_failed')`,
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
  }): Promise<PackageProposal> {
    await this.db
      .prepare(
        `UPDATE lmw_package_proposals
         SET status = 'payment_pending',
             provider_preference_id = ?,
             checkout_url = ?,
             checkout_expires_at = ?,
             last_provider_status = 'preference_created',
             updated_at = ?
         WHERE id = ? AND status = 'checkout_creating'`,
      )
      .bind(input.preferenceId, input.checkoutUrl, input.checkoutExpiresAt, nowIso(), input.id)
      .run();
    return (await this.getById(input.id))!;
  }

  async markCheckoutFailed(id: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE lmw_package_proposals
         SET status = 'checkout_failed', updated_at = ?
         WHERE id = ? AND status = 'checkout_creating'`,
      )
      .bind(nowIso(), id)
      .run();
  }

  async markCheckoutExpired(input: {
    id: string;
    preferenceId: string;
    expiresAt: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `UPDATE lmw_package_proposals
         SET checkout_expires_at = ?, updated_at = ?
         WHERE id = ? AND provider_preference_id = ?`,
      )
      .bind(input.expiresAt, nowIso(), input.id, input.preferenceId)
      .run();
  }

  async reconcilePayment(input: {
    id: string;
    paymentId: string;
    providerStatus: string;
    amountCents: number;
    currency: string;
    providerCreatedAt: string | null;
  }): Promise<PaymentReconciliationResult> {
    const now = nowIso();
    const proposalBefore = await this.getById(input.id);
    if (!proposalBefore) throw AppError.notFound('Propuesta');

    await this.db
      .prepare(
        `INSERT INTO lmw_payment_attempts
          (id, proposal_id, provider, provider_payment_id, provider_preference_id,
           provider_status, disposition, amount_cents, currency,
           provider_created_at, first_seen_at, updated_at)
         VALUES (?, ?, 'mercado_pago', ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
         ON CONFLICT(provider_payment_id) DO UPDATE SET
           provider_status = excluded.provider_status,
           provider_created_at = COALESCE(
             lmw_payment_attempts.provider_created_at,
             excluded.provider_created_at
           ),
           updated_at = excluded.updated_at
         WHERE lmw_payment_attempts.proposal_id = excluded.proposal_id`,
      )
      .bind(
        newId(),
        input.id,
        input.paymentId,
        proposalBefore.providerPreferenceId,
        input.providerStatus.slice(0, 80),
        input.amountCents,
        input.currency.slice(0, 12),
        input.providerCreatedAt,
        now,
        now,
      )
      .run();

    const attemptOwner = await this.db
      .prepare(
        `SELECT proposal_id FROM lmw_payment_attempts
         WHERE provider_payment_id = ? LIMIT 1`,
      )
      .bind(input.paymentId)
      .first<PaymentAttemptOwnerRow>();
    if (!attemptOwner || attemptOwner.proposal_id !== input.id) {
      throw new AppError('conflict', 'El identificador de pago ya pertenece a otra propuesta.');
    }

    if (input.providerStatus === 'approved') {
      await this.db
        .prepare(
          `UPDATE lmw_package_proposals
           SET status = 'paid',
               provider_payment_id = ?,
               last_provider_status = ?,
               paid_at = COALESCE(paid_at, ?),
               updated_at = ?
           WHERE id = ?
             AND (provider_payment_id IS NULL OR provider_payment_id = ?)`,
        )
        .bind(
          input.paymentId,
          input.providerStatus,
          input.providerCreatedAt ?? now,
          now,
          input.id,
          input.paymentId,
        )
        .run();
    }

    let proposal = (await this.getById(input.id))!;
    const decision = decidePaymentPolicy({
      providerStatus: input.providerStatus,
      canonicalPaymentId: proposal.providerPaymentId,
      incomingPaymentId: input.paymentId,
    });

    if (decision.reviewRequired) {
      await this.db
        .prepare(
          `UPDATE lmw_package_proposals
           SET payment_review_required = 1, updated_at = ?
           WHERE id = ?`,
        )
        .bind(now, input.id)
        .run();
    } else if (input.providerStatus !== 'approved' && decision.affectsProposal) {
      await this.db
        .prepare(
          `UPDATE lmw_package_proposals
           SET status = ?, last_provider_status = ?, updated_at = ?
           WHERE id = ?
             AND (
               provider_payment_id = ? OR
               (provider_payment_id IS NULL AND status <> 'paid')
             )`,
        )
        .bind(decision.proposalStatus, input.providerStatus, now, input.id, input.paymentId)
        .run();
    }

    await this.db
      .prepare(
        `UPDATE lmw_payment_attempts
         SET disposition = ?, provider_status = ?, updated_at = ?
         WHERE provider_payment_id = ? AND proposal_id = ?`,
      )
      .bind(decision.disposition, input.providerStatus.slice(0, 80), now, input.paymentId, input.id)
      .run();

    proposal = (await this.getById(input.id))!;
    return {
      proposal,
      disposition: decision.disposition,
      duplicatePayment: decision.reviewRequired,
    };
  }

  async claimWebhookEvent(input: {
    providerRequestId: string;
    topic: string;
    resourceId: string;
  }): Promise<string | null> {
    const id = newId();
    const now = nowIso();
    const inserted = await this.db
      .prepare(
        `INSERT OR IGNORE INTO lmw_payment_webhook_events
          (id, provider, provider_request_id, topic, resource_id, status,
           attempts, received_at, updated_at)
         VALUES (?, 'mercado_pago', ?, ?, ?, 'processing', 1, ?, ?)`,
      )
      .bind(id, input.providerRequestId, input.topic, input.resourceId, now, now)
      .run();
    if ((inserted.meta.changes ?? 0) === 1) return id;

    const existing = await this.db
      .prepare(
        `SELECT id FROM lmw_payment_webhook_events
         WHERE provider_request_id = ? AND status = 'failed'
         LIMIT 1`,
      )
      .bind(input.providerRequestId)
      .first<{ id: string }>();
    if (!existing) return null;

    const retried = await this.db
      .prepare(
        `UPDATE lmw_payment_webhook_events
         SET status = 'processing',
             attempts = attempts + 1,
             error_code = NULL,
             updated_at = ?
         WHERE id = ? AND status = 'failed'`,
      )
      .bind(now, existing.id)
      .run();
    return (retried.meta.changes ?? 0) === 1 ? existing.id : null;
  }

  async completeWebhookEvent(input: {
    id: string;
    status: 'processed' | 'ignored';
    proposalId: string | null;
    subscriptionId?: string | null;
    billingOrderId?: string | null;
    maintenanceSubscriptionId?: string | null;
  }): Promise<void> {
    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE lmw_payment_webhook_events
         SET status = ?, proposal_id = ?, subscription_id = ?, billing_order_id = ?,
             maintenance_subscription_id = ?,
             processed_at = ?, updated_at = ?
         WHERE id = ? AND status = 'processing'`,
      )
      .bind(
        input.status,
        input.proposalId,
        input.subscriptionId ?? null,
        input.billingOrderId ?? null,
        input.maintenanceSubscriptionId ?? null,
        now,
        now,
        input.id,
      )
      .run();
  }

  async failWebhookEvent(id: string, errorCode: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE lmw_payment_webhook_events
         SET status = 'failed', error_code = ?, updated_at = ?
         WHERE id = ? AND status = 'processing'`,
      )
      .bind(errorCode.slice(0, 80), nowIso(), id)
      .run();
  }
}

function mapPackageProposal(row: PackageProposalRow): PackageProposal {
  return {
    id: row.id,
    userId: row.user_id,
    plan: row.plan as PaidPackagePlan,
    modules: parseJson<PaidPackageModuleId[]>(row.modules, []),
    marketing: boolFromDb(row.marketing),
    status: row.status as PackageProposalStatus,
    amountCents: row.amount_cents,
    currency: row.currency as 'MXN',
    pricingVersion: row.pricing_version,
    packageSnapshot: parseJson<Metadata>(row.package_snapshot, {}),
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
