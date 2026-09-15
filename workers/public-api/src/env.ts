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
  /**
   * Token compartido con el Admin API para disparar bajo demanda una
   * reconciliación puntual de un pago atascado (misma lógica idempotente del
   * cron, nunca crea checkouts/cargos nuevos). Ausente = acción deshabilitada.
   */
  OPS_RECOVERY_TOKEN?: string;
  /** Dominio base para publicar URLs tipo slug.lmwares.com. */
  FREE_SITE_BASE_DOMAIN: string;
  /** Destino CNAME del proveedor manual de dominios Starter. */
  STARTER_DOMAIN_CNAME_TARGET?: string;
  /** Proveedor activo: manual (predeterminado) o cloudflare-saas. */
  DOMAIN_PROVIDER?: string;
  /** Token secreto para la API de Custom Hostnames de Cloudflare for SaaS. */
  CLOUDFLARE_SAAS_API_TOKEN?: string;
  /** Zone ID de lmwares.com para Custom Hostnames. */
  CLOUDFLARE_ZONE_ID?: string;
  /** CNAME SaaS proxied al fallback origin de Cloudflare. */
  CLOUDFLARE_SAAS_CNAME_TARGET?: string;
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
  /** Access Token exclusivo de Checkout Pro comercial. Siempre como secret. */
  MERCADO_PAGO_COMMERCIAL_ACCESS_TOKEN?: string;
  /** Firma productiva del Webhook de Checkout Pro comercial. */
  MERCADO_PAGO_COMMERCIAL_WEBHOOK_SECRET?: string;
  /** Firma de prueba del Webhook comercial, únicamente durante validación. */
  MERCADO_PAGO_COMMERCIAL_WEBHOOK_TEST_SECRET?: string;
  /** "1" habilita la creación de cobros comerciales; cerrado por defecto. */
  MERCADO_PAGO_COMMERCIAL_PAYMENTS_ENABLED?: string;
  /** "1" usa sandbox_init_point para la validación comercial controlada. */
  MERCADO_PAGO_COMMERCIAL_TEST_MODE?: string;
  /** Access Token productivo exclusivo de mensualidades comerciales. */
  MERCADO_PAGO_MAINTENANCE_ACCESS_TOKEN?: string;
  /** Firma productiva del Webhook de mensualidades comerciales. */
  MERCADO_PAGO_MAINTENANCE_WEBHOOK_SECRET?: string;
  /** Firma de prueba del Webhook mensual, sólo para validación privada. */
  MERCADO_PAGO_MAINTENANCE_WEBHOOK_TEST_SECRET?: string;
  /** "1" abre la autorización de mensualidades comerciales. */
  MERCADO_PAGO_MAINTENANCE_SUBSCRIPTIONS_ENABLED?: string;
  /** "1" permite identidades de prueba en el ensayo mensual controlado. */
  MERCADO_PAGO_MAINTENANCE_TEST_MODE?: string;
  /** Correo Buyer TEST emparejado con la aplicación mensual de prueba. */
  MERCADO_PAGO_MAINTENANCE_TEST_PAYER_EMAIL?: string;
  /** Binding tipado generado por `wrangler types`. */
  EMAIL: Env['EMAIL'];
  /** Despierta al runner Free asíncrono después de enviar una solicitud. */
  FREE_JOBS_QUEUE: Env['FREE_JOBS_QUEUE'];
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  /** Destino de alertas operativas (pagos atascados, etc). Vacío = alertas deshabilitadas. */
  ADMIN_ALERT_EMAIL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_ADMIN_CHAT_ID?: string;
  /** Alias operativo ya usado por los avisos existentes. */
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_NOTIFICATIONS_ENABLED?: string;
  /** Secreto del modelo que redacta alcances y construye contenido de demo. */
  DEEPSEEK_API_KEY?: string;
  /** Alias compatible con una variable creada originalmente en minúsculas. */
  deepseek_api_key?: string;
  /** Token separado para el constructor local de demos. */
  COMMERCIAL_DEMO_RUNNER_TOKEN?: string;
  /** Alias del token que usa el runner local. */
  LMWARES_COMMERCIAL_DEMO_RUNNER_TOKEN?: string;
  /** "1" para saltar la verificación de Turnstile (solo local). */
  TURNSTILE_DISABLED: string;
  /** Secreto de Turnstile (server-side). Inyectado como secret. */
  TURNSTILE_SECRET_KEY: string;
  /** client_email del service account de Google usado para Indexing/Site Verification API. */
  GOOGLE_INDEXING_CLIENT_EMAIL?: string;
  /** private_key (PEM) del mismo service account. Siempre como secret. */
  GOOGLE_INDEXING_PRIVATE_KEY?: string;
  /** Registrador de dominios activo: manual (predeterminado) o namesilo. */
  DOMAIN_REGISTRAR_PROVIDER?: string;
  /** API Key de Namesilo para búsqueda/compra/DNS de dominios. Siempre como secret. */
  NAMESILO_API_KEY?: string;
  /**
   * URL base del proxy (AWS Lambda) usado para llamar a Namesilo, porque
   * Namesilo bloquea (403) las IPs de salida de Cloudflare Workers. Si no se
   * configura, se llama a Namesilo directamente (fallará con 403 en producción).
   */
  NAMESILO_PROXY_BASE_URL?: string;
  /** Secreto compartido enviado como header X-Proxy-Secret al proxy de Namesilo. Siempre como secret. */
  NAMESILO_PROXY_SHARED_SECRET?: string;
  /** API Key pública de Porkbun (registrador de dominios). Siempre como secret. */
  PORKBUN_API_KEY?: string;
  /** Secret API Key de Porkbun. Siempre como secret. */
  PORKBUN_SECRET_API_KEY?: string;
}

export type Variables = {
  requestId: string;
  publicUser: PublicUser;
  publicSessionId: string;
  publicSessionExpiresAt: string;
  /** Transporte interno sustituible sólo al componer un Worker de prueba. */
  mercadoPagoFetch?: typeof fetch;
};
