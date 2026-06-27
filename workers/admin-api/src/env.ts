import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { AdminUser } from '@starter/domain';

/** Bindings y variables del Admin API Worker. */
export interface Bindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  ALLOWED_ORIGINS: string;
  MEDIA_BASE_URL: string;
  MEDIA_BUCKET_NAME: string;
  /** URL del Public API (o CDN) para previsualizar imágenes en el admin. */
  PUBLIC_API_URL: string;
  PROJECT_SLUG: string;
  /** p.ej. https://miorg.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN: string;
  /** AUD tag de la aplicación de Access. */
  ACCESS_AUD: string;
  /** "1" para auto-crear admins (rol viewer) en el primer login. */
  AUTO_PROVISION_ADMINS: string;
  /** "1" para saltar Access en local. */
  ACCESS_DISABLED: string;
}

export interface Identity {
  email: string;
  name: string | null;
}

export type Variables = {
  requestId: string;
  identity: Identity;
  admin: AdminUser;
};
