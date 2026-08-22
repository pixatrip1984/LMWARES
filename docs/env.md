# Variables de entorno y secretos

Regla de oro: **ningún secreto en `VITE_*`**. Todo lo que empieza por `VITE_`
se incrusta en el bundle del navegador y es público. Los secretos de runtime
viven en `.dev.vars` (local) y en `wrangler secret put` (remoto).

## Frontend (apps) — solo valores PÚBLICOS

| Variable                  | App        | Descripción                                |
| ------------------------- | ---------- | ------------------------------------------ |
| `VITE_PUBLIC_API_URL`     | public-web | URL del Public API Worker.                 |
| `VITE_TURNSTILE_SITE_KEY` | public-web | Site key de Turnstile (clave **pública**). |
| `VITE_ADMIN_API_URL`      | admin-web  | URL del Admin API Worker.                  |

## Public API Worker

| Clave                                            | Tipo                   | Dónde                                   | Descripción                                                                                                 |
| ------------------------------------------------ | ---------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ALLOWED_ORIGINS`                                | var                    | wrangler.toml                           | Orígenes CORS permitidos (coma).                                                                            |
| `MEDIA_BASE_URL`                                 | var                    | wrangler.toml                           | CDN/dominio de R2. Vacío = servir vía `/media`.                                                             |
| `PROJECT_SLUG`                                   | var                    | wrangler.toml                           | Slug del proyecto.                                                                                          |
| `TURNSTILE_DISABLED`                             | var local              | `.dev.vars`                             | `1` sólo en local para saltar Turnstile.                                                                    |
| `TURNSTILE_SECRET_KEY`                           | **secreto**            | `.dev.vars` / `wrangler secret`         | Clave secreta de Turnstile (server-side).                                                                   |
| `FREE_RUNNER_TOKEN`                              | **secreto**            | `.dev.vars` / `wrangler secret`         | Autentica al runner Free.                                                                                   |
| `GOOGLE_OAUTH_CLIENT_ID`                         | **secreto de entorno** | `.dev.vars` / `wrangler secret`         | OAuth Web Client de Google.                                                                                 |
| `GOOGLE_OAUTH_CLIENT_SECRET`                     | **secreto**            | `.dev.vars` / `wrangler secret`         | Secreto OAuth de Google.                                                                                    |
| `MERCADO_PAGO_ACCESS_TOKEN`                      | **secreto**            | `.dev.vars` / `wrangler secret`         | Credencial server-side de la aplicación Checkout Pro.                                                       |
| `MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN`        | **secreto**            | `.dev.vars` / `wrangler secret`         | Credencial server-side de la aplicación separada para Suscripciones.                                        |
| `MERCADO_PAGO_SUBSCRIPTIONS_TEST_PAYER_EMAIL`    | **secreto de prueba**  | `.dev.vars` / `wrangler secret`         | Correo del Buyer TEST emparejado con el Seller TEST de Suscripciones.                                       |
| `MERCADO_PAGO_WEBHOOK_SECRET`                    | **secreto**            | `.dev.vars` / `wrangler secret`         | Firma HMAC productiva de Checkout Pro.                                                                      |
| `MERCADO_PAGO_WEBHOOK_TEST_SECRET`               | **secreto de prueba**  | `.dev.vars` / `wrangler secret`         | Firma HMAC de prueba de Checkout Pro.                                                                       |
| `MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_SECRET`      | **secreto**            | `.dev.vars` / `wrangler secret`         | Firma HMAC productiva de la aplicación Suscripciones.                                                       |
| `MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_TEST_SECRET` | **secreto de prueba**  | `.dev.vars` / `wrangler secret`         | Firma HMAC de prueba de la aplicación Suscripciones.                                                        |
| `MERCADO_PAGO_TEST_MODE`                         | var temporal           | `.dev.vars` / ambiente remoto de prueba | `1` habilita el checkout y la suscripción técnica de Mercado Pago. En producción permanece `0`.             |
| `MERCADO_PAGO_TECHNICAL_CHECKOUT_ENABLED`        | var temporal           | `.dev.vars` / ambiente remoto de prueba | `1` permite crear nuevos checkouts técnicos. En producción debe permanecer `0` salvo una prueba controlada. |
| `PUBLIC_WEB_URL`                                 | var                    | wrangler.toml                           | Origen canónico del frontend.                                                                               |
| `PUBLIC_API_URL`                                 | var                    | wrangler.toml                           | Origen canónico del Public API y callback OAuth.                                                            |
| `FREE_SITE_BASE_DOMAIN`                          | var                    | wrangler.toml                           | Dominio wildcard de las páginas Free.                                                                       |
| `DOMAIN_PROVIDER`                                | var                    | wrangler.toml                           | `manual` por defecto; `cloudflare-saas` sólo tras habilitar SaaS.                                           |
| `CLOUDFLARE_ZONE_ID`                             | var                    | wrangler.toml                           | Zone ID de `lmwares.com` para Custom Hostnames.                                                             |
| `CLOUDFLARE_SAAS_CNAME_TARGET`                   | var                    | wrangler.toml                           | CNAME SaaS proxied al fallback origin.                                                                      |
| `CLOUDFLARE_SAAS_API_TOKEN`                      | **secreto**            | `.dev.vars` / `wrangler secret`         | Token limitado a SSL and Certificates Write en la zona.                                                     |
| `OPS_RECOVERY_TOKEN`                             | **secreto**            | `.dev.vars` / `wrangler secret`         | Compartido con Admin API; habilita "Reconciliar ahora" en pagos atascados. Ausente = acción deshabilitada.  |
| `EMAIL_FROM` / `EMAIL_REPLY_TO`                  | var                    | wrangler.toml                           | Remitente y respuesta transaccional.                                                                        |
| `EMAIL`                                          | binding email          | wrangler.toml                           | Cloudflare Email Service.                                                                                   |
| `DB`                                             | binding D1             | wrangler.toml                           | Base de datos.                                                                                              |
| `MEDIA`                                          | binding R2             | wrangler.toml                           | Bucket de archivos.                                                                                         |

Mercado Pago puede entregar pagos mediante dos transportes distintos. Los Webhooks
modernos (`type=payment&data.id=...`) exigen validar su firma HMAC. Las notificaciones
IPN heredadas (`topic=payment&id=...`) no pueden validarse con la clave secreta de
Webhooks: el receptor usa únicamente el identificador para consultar la API oficial y
comprueba la referencia externa, el importe y la moneda contra la propuesta interna
antes de actualizarla.

Mientras `MERCADO_PAGO_TEST_MODE=1`, un Webhook con encabezados de firma bien formados
pero cuya HMAC sandbox no coincida se concilia consultando el pago directamente al
proveedor y queda identificado como `payment_test_provider_verified`. Este fallback no
existe cuando el modo de prueba está apagado: producción siempre exige HMAC válida.
Cada checkout técnico vence a los 30 minutos y el primer pago aprobado conciliado queda
como pago canónico; cualquier aprobado adicional se conserva por separado y bloquea la
propuesta para revisión.

La misma URL de Webhook recibe los tópicos `payment`, `subscription_preapproval` y
`subscription_authorized_payment`. Checkout Pro debe enviar `payment`; la aplicación
separada de Suscripciones debe enviar los otros dos tópicos. Los tópicos recurrentes consultan el
recurso oficial antes de cambiar D1. En modo de prueba pueden usar el mismo fallback
verificado por proveedor; con `MERCADO_PAGO_TEST_MODE=0` todos los Webhooks modernos
requieren HMAC válida. Ambas aplicaciones conservan como callback
`https://api.lmwares.com/payments/webhooks/mercado-pago`, cada una con su firma propia.

## Admin API Worker

| Clave                          | Tipo     | Dónde         | Descripción                                                        |
| ------------------------------ | -------- | ------------- | ------------------------------------------------------------------ |
| `ALLOWED_ORIGINS`              | var      | wrangler.toml | Origen del admin-web (con credentials).                            |
| `MEDIA_BASE_URL`               | var      | wrangler.toml | CDN de R2 para previsualizar imágenes.                             |
| `MEDIA_BUCKET_NAME`            | var      | wrangler.toml | Nombre lógico del bucket (se guarda en FileAsset).                 |
| `PUBLIC_API_URL`               | var      | wrangler.toml | Fallback para previsualizar imágenes vía `/media`.                 |
| `PROJECT_SLUG`                 | var      | wrangler.toml | Slug del proyecto.                                                 |
| `ACCESS_TEAM_DOMAIN`           | var      | wrangler.toml | `https://<tuorg>.cloudflareaccess.com`.                            |
| `ACCESS_AUD`                   | var      | wrangler.toml | AUD tag de la aplicación de Access.                                |
| `AUTO_PROVISION_ADMINS`        | var      | `.dev.vars`   | Sólo local: `1` crea AdminUser (viewer) al primer login.           |
| `ACCESS_DISABLED`              | var      | `.dev.vars`   | Sólo local: `1` salta Access (usa `X-Dev-Email`).                  |
| `ADMIN_EMAIL_ALLOWLIST`        | secreto/var | producción | Correos Access explícitamente autorizados; debe coincidir con la política Access. |
| `CLOUDFLARE_ZONE_ID`           | var      | wrangler.toml | Zona de `lmwares.com` para Custom Hostnames, sólo al activar SaaS. |
| `CLOUDFLARE_SAAS_CNAME_TARGET` | var      | wrangler.toml | CNAME SaaS proxied al fallback origin.                             |
| `OPS_RECOVERY_TOKEN`           | **secreto** | `wrangler secret` | Idéntico al del Public API; habilita "Reconciliar ahora" en el dashboard. |
| `DB` / `MEDIA`                 | bindings | wrangler.toml | D1 y R2 (mismos recursos que el público).                          |

> El Admin API normalmente no necesita secretos: Access se valida con claves
> públicas (JWKS) descargadas del dominio del equipo. Si se habilita
> `cloudflare-saas`, también necesita `CLOUDFLARE_SAAS_API_TOKEN` como secreto
> del Worker para sincronizar y retirar Custom Hostnames. Para reconciliar
> pagos atascados desde el dashboard también necesita `OPS_RECOVERY_TOKEN`,
> con el mismo valor configurado en el Public API (server-to-server, nunca
> visible en el navegador).

## Monorepo (`.env` raíz)

| Variable                | Descripción                        |
| ----------------------- | ---------------------------------- |
| `PROJECT_SLUG`          | Slug base para nombrar recursos.   |
| `CLOUDFLARE_ACCOUNT_ID` | Para scripts de aprovisionamiento. |
| `CF_ACCESS_TEAM_DOMAIN` | Dominio del equipo de Access.      |

## Separación por entorno (local / preview / production)

- **Local**: valores en `.dev.vars` (por Worker) y `.env` de cada app. Nunca
  apuntan a Mercado Pago real ni a `DOMAIN_PROVIDER=cloudflare-saas`; usan
  `TURNSTILE_DISABLED=1` / `ACCESS_DISABLED=1` y tokens de prueba
  (`MERCADO_PAGO_*_TEST_*`). El D1 local (`--local`) es una copia aislada, no
  el remoto.
- **Preview** (ramas y PRs vía Pages/Workers preview): usa el mismo
  `wrangler.toml` que producción salvo que se declare explícitamente un
  `[env.preview]`; si un secreto de prueba se necesita en preview, cárgalo con
  `wrangler secret put <NOMBRE> --env preview`, nunca reutilices el secreto de
  producción para evitar que un preview dispare cobros o dominios reales.
- **Production**: únicos entornos con `MERCADO_PAGO_ACCESS_TOKEN` real,
  `CLOUDFLARE_SAAS_API_TOKEN` real y `DOMAIN_PROVIDER=cloudflare-saas` (cuando
  se habilite). El deploy de Pages a producción siempre debe incluir
  `--branch main`; el deploy de un Worker a producción usa `--env production`
  explícito, nunca el entorno por defecto sin bandera.
- Antes de habilitar un secreto de producción, confirma con
  `npx wrangler secret list --env production` (o sin `--env` si el Worker no
  declara entornos) que no queda un valor de prueba residual con el mismo
  nombre.

## Gestionar secretos en remoto

```bash
cd workers/public-api
npx wrangler@4.105.0 secret put TURNSTILE_SECRET_KEY
npx wrangler@4.105.0 secret put FREE_RUNNER_TOKEN
npx wrangler@4.105.0 secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler@4.105.0 secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler@4.105.0 secret put MERCADO_PAGO_ACCESS_TOKEN
npx wrangler@4.105.0 secret put MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN
npx wrangler@4.105.0 secret put MERCADO_PAGO_SUBSCRIPTIONS_TEST_PAYER_EMAIL
npx wrangler@4.105.0 secret put MERCADO_PAGO_WEBHOOK_SECRET
npx wrangler@4.105.0 secret put MERCADO_PAGO_WEBHOOK_TEST_SECRET
npx wrangler@4.105.0 secret put MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_SECRET
npx wrangler@4.105.0 secret put MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_TEST_SECRET
npx wrangler@4.105.0 secret put CLOUDFLARE_SAAS_API_TOKEN
```

El mismo secreto de Cloudflare debe cargarse también en
`workers/admin-api/wrangler.toml` cuando se habilite `DOMAIN_PROVIDER =
"cloudflare-saas"`. No se imprime, se pasa por argumentos ni se guarda en el
repositorio.

Para staging administrado, genera artefactos desde un perfil local y carga los
secretos contra el `wrangler.toml` generado en `.deploy/<slug>/`. El valor del
secreto se pega cuando Wrangler lo pide; no debe escribirse en la linea del
comando ni guardarse en el perfil.
