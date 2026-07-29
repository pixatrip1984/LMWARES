import type { D1Database } from '@cloudflare/workers-types';
import type {
  Metadata,
  PackageProposal,
  PackageProposalStatus,
  PaidPackageModuleId,
  PaidPackagePlan,
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
  last_provider_status: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
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
  }): Promise<PackageProposal> {
    await this.db
      .prepare(
        `UPDATE lmw_package_proposals
         SET status = 'payment_pending',
             provider_preference_id = ?,
             checkout_url = ?,
             last_provider_status = 'preference_created',
             updated_at = ?
         WHERE id = ? AND status = 'checkout_creating'`,
      )
      .bind(input.preferenceId, input.checkoutUrl, nowIso(), input.id)
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

  async savePayment(input: {
    id: string;
    paymentId: string;
    providerStatus: string;
    status: PackageProposalStatus;
  }): Promise<PackageProposal> {
    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE lmw_package_proposals
         SET status = ?,
             provider_payment_id = ?,
             last_provider_status = ?,
             paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, ?) ELSE paid_at END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(input.status, input.paymentId, input.providerStatus, input.status, now, now, input.id)
      .run();
    return (await this.getById(input.id))!;
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
  }): Promise<void> {
    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE lmw_payment_webhook_events
         SET status = ?, proposal_id = ?, processed_at = ?, updated_at = ?
         WHERE id = ? AND status = 'processing'`,
      )
      .bind(input.status, input.proposalId, now, now, input.id)
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
    lastProviderStatus: row.last_provider_status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
