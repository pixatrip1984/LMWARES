import type { D1Database } from '@cloudflare/workers-types';
import type { PublicUser } from '@starter/domain';
import { boolToDb, newId, nowIso, nullable } from '../helpers';
import { mapPublicUser } from '../mappers';
import type {
  OAuthTransactionRow,
  PublicSessionWithUserRow,
  PublicUserRow,
} from '../rows';

export interface CreateOAuthTransactionData {
  stateHash: string;
  provider: 'google';
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  expiresAt: string;
}

export interface OAuthTransaction {
  stateHash: string;
  provider: string;
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface PublicSessionRecord {
  id: string;
  user: PublicUser;
  expiresAt: string;
}

export class LmwaresAuthRepository {
  constructor(private readonly db: D1Database) {}

  async createOAuthTransaction(data: CreateOAuthTransactionData): Promise<void> {
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmw_oauth_transactions
          (state_hash, provider, code_verifier, nonce, return_to, expires_at, consumed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .bind(
        data.stateHash,
        data.provider,
        data.codeVerifier,
        data.nonce,
        data.returnTo,
        data.expiresAt,
        now,
      )
      .run();

    // Limpieza oportunista; no forma parte del camino crítico de autenticación.
    await this.db
      .prepare(`DELETE FROM lmw_oauth_transactions WHERE expires_at < ? OR consumed_at IS NOT NULL`)
      .bind(new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .run();
  }

  async consumeOAuthTransaction(
    stateHash: string,
    provider: 'google',
    now = nowIso(),
  ): Promise<OAuthTransaction | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM lmw_oauth_transactions
         WHERE state_hash = ? AND provider = ? AND consumed_at IS NULL AND expires_at > ?
         LIMIT 1`,
      )
      .bind(stateHash, provider, now)
      .first<OAuthTransactionRow>();
    if (!row) return null;

    const result = await this.db
      .prepare(
        `UPDATE lmw_oauth_transactions
         SET consumed_at = ?
         WHERE state_hash = ? AND consumed_at IS NULL`,
      )
      .bind(now, stateHash)
      .run();
    if ((result.meta.changes ?? 0) !== 1) return null;

    return {
      stateHash: row.state_hash,
      provider: row.provider,
      codeVerifier: row.code_verifier,
      nonce: row.nonce,
      returnTo: row.return_to,
      expiresAt: row.expires_at,
      consumedAt: now,
      createdAt: row.created_at,
    };
  }

  async upsertGoogleIdentity(input: {
    subject: string;
    email: string;
    emailVerified: boolean;
    name: string | null;
    pictureUrl: string | null;
  }): Promise<PublicUser> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.getUserByIdentity('google', input.subject);
    const now = nowIso();

    if (existing) {
      await this.db.batch([
        this.db
          .prepare(
            `UPDATE lmw_users
             SET email = ?, name = ?, picture_url = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(
            normalizedEmail,
            nullable(input.name),
            nullable(input.pictureUrl),
            now,
            existing.id,
          ),
        this.db
          .prepare(
            `UPDATE lmw_identities
             SET email_at_login = ?, email_verified = ?, last_login_at = ?
             WHERE provider = 'google' AND provider_subject = ?`,
          )
          .bind(normalizedEmail, boolToDb(input.emailVerified), now, input.subject),
      ]);
      return (await this.getUserByIdentity('google', input.subject))!;
    }

    const userId = newId();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO lmw_users (id, email, name, picture_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          normalizedEmail,
          nullable(input.name),
          nullable(input.pictureUrl),
          now,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO lmw_identities
            (id, user_id, provider, provider_subject, email_at_login, email_verified, created_at, last_login_at)
           VALUES (?, ?, 'google', ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          userId,
          input.subject,
          normalizedEmail,
          boolToDb(input.emailVerified),
          now,
          now,
        ),
    ]);

    return (await this.getUserByIdentity('google', input.subject))!;
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<PublicSessionRecord> {
    const id = newId();
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO lmw_sessions
          (id, user_id, token_hash, expires_at, revoked_at, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      )
      .bind(id, input.userId, input.tokenHash, input.expiresAt, now, now)
      .run();
    return (await this.getActiveSessionByTokenHash(input.tokenHash, now))!;
  }

  async getActiveSessionByTokenHash(
    tokenHash: string,
    now = nowIso(),
  ): Promise<PublicSessionRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           u.*,
           s.id AS session_id,
           s.expires_at AS expires_at
         FROM lmw_sessions s
         INNER JOIN lmw_users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
         LIMIT 1`,
      )
      .bind(tokenHash, now)
      .first<PublicSessionWithUserRow>();
    if (!row) return null;
    return {
      id: row.session_id,
      user: mapPublicUser(row),
      expiresAt: row.expires_at,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db
      .prepare(`UPDATE lmw_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`)
      .bind(nowIso(), sessionId)
      .run();
  }

  private async getUserByIdentity(provider: string, subject: string): Promise<PublicUser | null> {
    const row = await this.db
      .prepare(
        `SELECT u.*
         FROM lmw_identities i
         INNER JOIN lmw_users u ON u.id = i.user_id
         WHERE i.provider = ? AND i.provider_subject = ?
         LIMIT 1`,
      )
      .bind(provider, subject)
      .first<PublicUserRow>();
    return row ? mapPublicUser(row) : null;
  }
}
