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
  /** Lista explícita de correos Access autorizados a sincronizar, separados por coma. */
  ADMIN_EMAIL_ALLOWLIST?: string;
  /** "1" para saltar Access en local. */
  ACCESS_DISABLED: string;
  /** Solo desarrollo local: habilita fixtures de pago sin tocar Mercado Pago. */
  TEST_FIXTURES_ENABLED?: string;
  /** Token secreto para la API de Custom Hostnames de Cloudflare for SaaS. */
  CLOUDFLARE_SAAS_API_TOKEN?: string;
  /** Zone ID de lmwares.com para Custom Hostnames. */
  CLOUDFLARE_ZONE_ID?: string;
  /** CNAME SaaS proxied al fallback origin de Cloudflare. */
  CLOUDFLARE_SAAS_CNAME_TARGET?: string;
  /**
   * Token compartido con el Public API para disparar una reconciliación
   * puntual de un pago atascado (misma lógica idempotente del cron). Ausente
   * = el botón de "reconciliar ahora" queda deshabilitado sin fallar el resto
   * del panel.
   */
  OPS_RECOVERY_TOKEN?: string;
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
