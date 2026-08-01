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
  /** Proveedor de geocodificación intercambiable usado únicamente por el proxy del mapa. */
  MAP_SEARCH_BASE_URL?: string;
  /** Proveedor OSM preparado para sugerencias mientras el usuario escribe. */
  MAP_SUGGEST_BASE_URL?: string;
  /** OAuth Web Client de Google. */
  GOOGLE_OAUTH_CLIENT_ID: string;
  /** Secreto del OAuth Web Client de Google. Siempre como secret. */
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  /** Access Token de la aplicación Checkout Pro. Siempre como secret. */
  MERCADO_PAGO_ACCESS_TOKEN: string;
  /** Access Token de la aplicación separada para Suscripciones. Siempre como secret. */
  MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN?: string;
  /** Correo real del Buyer TEST emparejado con la aplicación Seller TEST. */
  MERCADO_PAGO_SUBSCRIPTIONS_TEST_PAYER_EMAIL?: string;
  /** Firma productiva de Webhooks de Checkout Pro; siempre se configura como secret. */
  MERCADO_PAGO_WEBHOOK_SECRET?: string;
  /** Firma de Webhooks de prueba de Checkout Pro; sólo se acepta en modo prueba. */
  MERCADO_PAGO_WEBHOOK_TEST_SECRET?: string;
  /** Firma productiva de Webhooks de la aplicación Suscripciones. */
  MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_SECRET?: string;
  /** Firma de Webhooks de prueba de la aplicación Suscripciones. */
  MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_TEST_SECRET?: string;
  /** Debe ser "1" para habilitar el checkout técnico con credenciales de prueba. */
  MERCADO_PAGO_TEST_MODE: string;
  /** Puerta independiente para crear nuevos checkouts/suscripciones técnicas. */
  MERCADO_PAGO_TECHNICAL_CHECKOUT_ENABLED?: string;
  /** Binding tipado generado por `wrangler types`. */
  EMAIL: Env['EMAIL'];
  /** Despierta al runner Free asíncrono después de enviar una solicitud. */
  FREE_JOBS_QUEUE: Env['FREE_JOBS_QUEUE'];
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
