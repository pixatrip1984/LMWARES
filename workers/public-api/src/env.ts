import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

/** Bindings y variables del Public API Worker. */
export interface Bindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  /** Lista separada por comas de orígenes permitidos para CORS. */
  ALLOWED_ORIGINS: string;
  /** Base URL del CDN de R2 (vacío = servir vía /media). */
  MEDIA_BASE_URL: string;
  PROJECT_SLUG: string;
  /** Token de servicio para el runner privado Free. En producción debe ser secret. */
  FREE_RUNNER_TOKEN: string;
  /** Dominio base para publicar URLs tipo slug.lmwares.com. */
  FREE_SITE_BASE_DOMAIN: string;
  /** "1" para saltar la verificación de Turnstile (solo local). */
  TURNSTILE_DISABLED: string;
  /** Secreto de Turnstile (server-side). Inyectado como secret. */
  TURNSTILE_SECRET_KEY: string;
}

export type Variables = {
  requestId: string;
};
