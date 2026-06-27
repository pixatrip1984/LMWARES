import type { Id, IsoDateTime } from '../common';

/** Roles base. La autorización fina se hace en el Admin API. */
export const ADMIN_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Espejo local del usuario administrador. La identidad real la provee
 * Cloudflare Access (JWT); este registro guarda rol y metadatos de negocio.
 * Se vincula por email.
 */
export interface AdminUser {
  id: Id;
  email: string;
  name: string | null;
  role: AdminRole;
  active: boolean;
  lastLoginAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}
