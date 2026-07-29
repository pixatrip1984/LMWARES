import type { D1Database } from '@cloudflare/workers-types';
import {
  AppError,
  subscriptionStatusFromCharge,
  subscriptionStatusFromProvider,
  type PackageSubscription,
  type PackageSubscriptionStatus,
} from '@starter/domain';
import { newId, nowIso } from '../helpers';

interface SubscriptionRow {
  id: string;
  proposal_id: string;
  user_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  frequency: number;
  frequency_type: string;
  pricing_version: string;
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

interface AuthorizedPaymentOwnerRow {
  subscription_id: string;
}

export interface SubscriptionCreationClaim {
  subscription: PackageSubscription;
  claimed: boolean;
}

export class LmwaresSubscriptionsRepository {
  constructor(private readonly db: D1Database) {}

  async getById(id: string): Promise<PackageSubscription | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_subscriptions WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<SubscriptionRow>();
    return row ? mapSubscription(row) : null;
  }

  async getByProposalId(proposalId: string): Promise<PackageSubscription | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_subscriptions WHERE proposal_id = ? LIMIT 1`)
      .bind(proposalId)
      .first<SubscriptionRow>();
    return row ? mapSubscription(row) : null;
  }

  async getByExternalReference(externalReference: string): Promise<PackageSubscription | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_subscriptions WHERE external_reference = ? LIMIT 1`)
      .bind(externalReference)
      .first<SubscriptionRow>();
    return row ? mapSubscription(row) : null;
  }

  async getByProviderPreapprovalId(providerId: string): Promise<PackageSubscription | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_subscriptions WHERE provider_preapproval_id = ? LIMIT 1`)
      .bind(providerId)
      .first<SubscriptionRow>();
    return row ? mapSubscription(row) : null;
  }

  async claimCreation(input: {
    proposalId: string;
    userId: string;
    amountCents: number;
    currency: 'MXN';
    pricingVersion: string;
  }): Promise<SubscriptionCreationClaim> {
    const id = newId();
    const now = nowIso();
    const inserted = await this.db
      .prepare(
        `INSERT OR IGNORE INTO lmw_subscriptions
          (id, proposal_id, user_id, status, amount_cents, currency, frequency,
           frequency_type, pricing_version, provider, external_reference,
           created_at, updated_at)
         VALUES (?, ?, ?, 'creating', ?, ?, 1, 'months', ?, 'mercado_pago', ?, ?, ?)`,
      )
      .bind(
        id,
        input.proposalId,
        input.userId,
        input.amountCents,
        input.currency,
        input.pricingVersion,
        id,
        now,
        now,
      )
      .run();
    if ((inserted.meta.changes ?? 0) === 1) {
      return { subscription: (await this.getById(id))!, claimed: true };
    }

    let existing = await this.getByProposalId(input.proposalId);
    if (!existing) throw new AppError('internal_error', 'No fue posible reservar la suscripción.');
    if (existing.status === 'creation_failed' && !existing.providerPreapprovalId) {
      const retried = await this.db
        .prepare(
          `UPDATE lmw_subscriptions
           SET status = 'creating', amount_cents = ?, currency = ?,
               frequency = 1, frequency_type = 'months', pricing_version = ?,
               updated_at = ?
           WHERE id = ? AND status = 'creation_failed' AND provider_preapproval_id IS NULL`,
        )
        .bind(
          input.amountCents,
          input.currency,
          input.pricingVersion,
          now,
          existing.id,
        )
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
  }): Promise<PackageSubscription> {
    const now = nowIso();
    const status = subscriptionStatusFromProvider(input.providerStatus);
    await this.db
      .prepare(
        `UPDATE lmw_subscriptions
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

  async reconcilePreapproval(input: {
    id: string;
    providerStatus: string;
    authorizationUrl: string;
    nextPaymentDate: string | null;
  }): Promise<PackageSubscription> {
    const current = await this.getById(input.id);
    if (!current?.providerPreapprovalId) throw AppError.notFound('Suscripción');
    return this.savePreapproval({
      id: current.id,
      providerPreapprovalId: current.providerPreapprovalId,
      authorizationUrl: input.authorizationUrl,
      providerStatus: input.providerStatus,
      nextPaymentDate: input.nextPaymentDate,
    });
  }

  async markCreationFailed(id: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE lmw_subscriptions SET status = 'creation_failed', updated_at = ?
         WHERE id = ? AND status = 'creating' AND provider_preapproval_id IS NULL`,
      )
      .bind(nowIso(), id)
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
  }): Promise<PackageSubscription> {
    const subscription = await this.getById(input.subscriptionId);
    if (!subscription) throw AppError.notFound('Suscripción');
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmw_subscription_charges
          (id, subscription_id, provider, provider_authorized_payment_id,
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
         WHERE lmw_subscription_charges.subscription_id = excluded.subscription_id`,
      )
      .bind(
        newId(),
        subscription.id,
        input.providerAuthorizedPaymentId,
        input.providerPaymentId,
        input.providerStatus.slice(0, 80),
        input.summarized?.slice(0, 80) ?? null,
        input.amountCents,
        input.currency.slice(0, 12),
        input.debitDate,
        Math.max(0, input.retryAttempt),
        now,
        now,
      )
      .run();

    const chargeOwner = await this.db
      .prepare(
        `SELECT subscription_id FROM lmw_subscription_charges
         WHERE provider_authorized_payment_id = ? LIMIT 1`,
      )
      .bind(input.providerAuthorizedPaymentId)
      .first<AuthorizedPaymentOwnerRow>();
    if (!chargeOwner || chargeOwner.subscription_id !== subscription.id) {
      throw new AppError(
        'conflict',
        'El cargo programado ya pertenece a otra suscripción.',
      );
    }

    const status = subscriptionStatusFromCharge(
      input.providerStatus,
      input.paymentStatus,
      subscription.status,
    );
    await this.db
      .prepare(
        `UPDATE lmw_subscriptions
         SET status = ?, last_authorized_payment_id = ?, last_authorized_status = ?,
             updated_at = ?
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

function mapSubscription(row: SubscriptionRow): PackageSubscription {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    userId: row.user_id,
    status: row.status as PackageSubscriptionStatus,
    amountCents: row.amount_cents,
    currency: row.currency as 'MXN',
    frequency: row.frequency,
    frequencyType: row.frequency_type as 'months',
    pricingVersion: row.pricing_version,
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
