import type { D1Database } from '@cloudflare/workers-types';
import type { AdminUser } from '@starter/domain';
import { boolToDb, newId, nowIso, nullable } from '../helpers';
import { mapAdminUser } from '../mappers';
import type { AdminUserRow } from '../rows';

export class AdminUsersRepository {
  constructor(private readonly db: D1Database) {}

  async getByEmail(email: string): Promise<AdminUser | null> {
    const row = await this.db
      .prepare(`SELECT * FROM admin_users WHERE email = ?`)
      .bind(email.toLowerCase())
      .first<AdminUserRow>();
    return row ? mapAdminUser(row) : null;
  }

  /**
   * Sincroniza el usuario a partir de la identidad de Cloudflare Access.
   * Si no existe y `autoProvision` está activo, lo crea con rol 'viewer'.
   * Actualiza last_login_at en cada acceso.
   */
  async syncFromAccess(
    email: string,
    name: string | null,
    autoProvision: boolean,
  ): Promise<AdminUser | null> {
    const normalized = email.toLowerCase();
    const existing = await this.getByEmail(normalized);
    const now = nowIso();

    if (existing) {
      await this.db
        .prepare(`UPDATE admin_users SET last_login_at = ?, name = COALESCE(?, name) WHERE id = ?`)
        .bind(now, nullable(name), existing.id)
        .run();
      return this.getByEmail(normalized);
    }

    if (!autoProvision) return null;

    await this.db
      .prepare(
        `INSERT INTO admin_users (id, email, name, role, active, last_login_at, created_at)
         VALUES (?, ?, ?, 'viewer', ?, ?, ?)`,
      )
      .bind(newId(), normalized, nullable(name), boolToDb(true), now, now)
      .run();
    return this.getByEmail(normalized);
  }

  async list(): Promise<AdminUser[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM admin_users ORDER BY created_at ASC`)
      .all<AdminUserRow>();
    return results.map(mapAdminUser);
  }
}
