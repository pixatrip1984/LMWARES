import type { D1Database } from '@cloudflare/workers-types';
import type { Metadata } from '@starter/domain';
import { nowIso, parseJson } from '../helpers';

interface NotificationRow {
  id: string;
  user_id: string;
  intake_id: string | null;
  channel: string;
  template: string;
  to_address: string;
  dedupe_key: string;
  status: string;
  attempt: number;
  max_attempts: number;
  next_attempt_at: string | null;
  lease_until: string | null;
  claimed_by: string | null;
  provider_message_id: string | null;
  payload: string;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LmwaresNotification {
  id: string;
  userId: string;
  intakeId: string | null;
  channel: string;
  template: string;
  toAddress: string;
  dedupeKey: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  leaseUntil: string | null;
  claimedBy: string | null;
  providerMessageId: string | null;
  payload: Metadata;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class LmwaresNotificationsRepository {
  constructor(private readonly db: D1Database) {}

  async claimNext(claimedBy: string, leaseSeconds = 120): Promise<LmwaresNotification | null> {
    const now = nowIso();
    const row = await this.db
      .prepare(
        `SELECT * FROM lmw_notifications
         WHERE attempt < max_attempts
           AND (
             (status IN ('pending', 'failed') AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?)
             OR (status = 'sending' AND lease_until IS NOT NULL AND lease_until <= ?)
           )
         ORDER BY created_at ASC
         LIMIT 1`,
      )
      .bind(now, now)
      .first<NotificationRow>();
    if (!row) return null;

    const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    const result = await this.db
      .prepare(
        `UPDATE lmw_notifications
         SET status = 'sending',
             attempt = attempt + 1,
             claimed_by = ?,
             lease_until = ?,
             updated_at = ?
         WHERE id = ?
           AND attempt < max_attempts
           AND (
             (status IN ('pending', 'failed') AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?)
             OR (status = 'sending' AND lease_until IS NOT NULL AND lease_until <= ?)
           )`,
      )
      .bind(claimedBy, leaseUntil, now, row.id, now, now)
      .run();
    if ((result.meta.changes ?? 0) !== 1) return null;

    return this.getById(row.id);
  }

  async markSent(
    id: string,
    claimedBy: string,
    providerMessageId: string,
  ): Promise<LmwaresNotification | null> {
    const existing = await this.getById(id);
    if (!existing || existing.claimedBy !== claimedBy || existing.status !== 'sending') return null;
    const now = nowIso();
    const statements = [
      this.db
        .prepare(
          `UPDATE lmw_notifications
           SET status = 'sent',
               provider_message_id = ?,
               sent_at = ?,
               next_attempt_at = NULL,
               lease_until = NULL,
               claimed_by = NULL,
               error_code = NULL,
               error_message = NULL,
               updated_at = ?
           WHERE id = ? AND status = 'sending' AND claimed_by = ?`,
        )
        .bind(providerMessageId, now, now, id, claimedBy),
    ];
    if (existing.intakeId) {
      statements.push(
        this.db
          .prepare(
            `UPDATE lmw_free_intakes
             SET status = 'notified', updated_at = ?
             WHERE id = ? AND status = 'published'`,
          )
          .bind(now, existing.intakeId),
      );
    }
    await this.db.batch(statements);
    return this.getById(id);
  }

  async markFailed(input: {
    id: string;
    claimedBy: string;
    code: string;
    message: string;
    retryAt: string | null;
  }): Promise<LmwaresNotification | null> {
    const now = nowIso();
    await this.db
      .prepare(
        `UPDATE lmw_notifications
         SET status = 'failed',
             next_attempt_at = ?,
             lease_until = NULL,
             claimed_by = NULL,
             error_code = ?,
             error_message = ?,
             updated_at = ?
         WHERE id = ? AND status = 'sending' AND claimed_by = ?`,
      )
      .bind(
        input.retryAt,
        input.code.slice(0, 100),
        input.message.slice(0, 500),
        now,
        input.id,
        input.claimedBy,
      )
      .run();
    return this.getById(input.id);
  }

  async getById(id: string): Promise<LmwaresNotification | null> {
    const row = await this.db
      .prepare(`SELECT * FROM lmw_notifications WHERE id = ?`)
      .bind(id)
      .first<NotificationRow>();
    return row ? mapNotification(row) : null;
  }

  async listForUser(userId: string, limit = 50): Promise<LmwaresNotification[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const { results } = await this.db
      .prepare(
        `SELECT * FROM lmw_notifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(userId, safeLimit)
      .all<NotificationRow>();
    return results.map(mapNotification);
  }

  async markRead(id: string, userId: string): Promise<LmwaresNotification | null> {
    const now = nowIso();
    const result = await this.db
      .prepare(
        `UPDATE lmw_notifications
         SET read_at = COALESCE(read_at, ?), updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(now, now, id, userId)
      .run();
    if ((result.meta.changes ?? 0) !== 1) return null;
    return this.getById(id);
  }

  async markAllRead(userId: string): Promise<number> {
    const now = nowIso();
    const result = await this.db
      .prepare(
        `UPDATE lmw_notifications
         SET read_at = ?, updated_at = ?
         WHERE user_id = ? AND read_at IS NULL`,
      )
      .bind(now, now, userId)
      .run();
    return result.meta.changes ?? 0;
  }
}

function mapNotification(row: NotificationRow): LmwaresNotification {
  return {
    id: row.id,
    userId: row.user_id,
    intakeId: row.intake_id,
    channel: row.channel,
    template: row.template,
    toAddress: row.to_address,
    dedupeKey: row.dedupe_key,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at,
    leaseUntil: row.lease_until,
    claimedBy: row.claimed_by,
    providerMessageId: row.provider_message_id,
    payload: parseJson<Metadata>(row.payload, {}),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    readAt: row.read_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
