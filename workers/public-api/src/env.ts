import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { PublicUser } from '@starter/domain';

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
  /** Origen canónico del frontend público, sin slash final. */
  PUBLIC_WEB_URL: string;
  /** Origen canónico de este Worker, sin slash final. */
  PUBLIC_API_URL: string;
  /** OAuth Web Client de Google. */
  GOOGLE_OAUTH_CLIENT_ID: string;
  /** Secreto del OAuth Web Client de Google. Siempre como secret. */
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  /** Access Token de una aplicación de prueba de Mercado Pago. Siempre como secret. */
  MERCADO_PAGO_ACCESS_TOKEN: string;
  /** Firma secreta de Webhooks de Mercado Pago; siempre se configura como secret. */
  MERCADO_PAGO_WEBHOOK_SECRET?: string;
  /** Debe ser "1" para habilitar el checkout técnico con credenciales de prueba. */
  MERCADO_PAGO_TEST_MODE: string;
  /** Binding tipado generado por `wrangler types`. */
  EMAIL: Env['EMAIL'];
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  /** "1" para saltar la verificación de Turnstile (solo local). */
  TURNSTILE_DISABLED: string;
  /** Secreto de Turnstile (server-side). Inyectado como secret. */
  TURNSTILE_SECRET_KEY: string;
}

export type Variables = {
  requestId: string;
  publicUser: PublicUser;
  publicSessionId: string;
  publicSessionExpiresAt: string;
};
