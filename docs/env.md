# Variables de entorno y secretos

Regla de oro: **ningún secreto en `VITE_*`**. Todo lo que empieza por `VITE_`
se incrusta en el bundle del navegador y es público. Los secretos de runtime
viven en `.dev.vars` (local) y en `wrangler secret put` (remoto).

## Frontend (apps) — solo valores PÚBLICOS

| Variable                 | App         | Descripción                                  |
| ------------------------ | ----------- | -------------------------------------------- |
| `VITE_PUBLIC_API_URL`    | public-web  | URL del Public API Worker.                   |
| `VITE_TURNSTILE_SITE_KEY`| public-web  | Site key de Turnstile (clave **pública**).   |
| `VITE_ADMIN_API_URL`     | admin-web   | URL del Admin API Worker.                    |

## Public API Worker

| Clave                 | Tipo            | Dónde                         | Descripción                                          |
| --------------------- | --------------- | ----------------------------- | ---------------------------------------------------- |
| `ALLOWED_ORIGINS`     | var             | wrangler.toml                 | Orígenes CORS permitidos (coma).                     |
| `MEDIA_BASE_URL`      | var             | wrangler.toml                 | CDN/dominio de R2. Vacío = servir vía `/media`.      |
| `PROJECT_SLUG`        | var             | wrangler.toml                 | Slug del proyecto.                                   |
| `TURNSTILE_DISABLED`  | var local       | `.dev.vars`                   | `1` sólo en local para saltar Turnstile.             |
| `TURNSTILE_SECRET_KEY`| **secreto**     | `.dev.vars` / `wrangler secret` | Clave secreta de Turnstile (server-side).          |
| `FREE_RUNNER_TOKEN`   | **secreto**     | `.dev.vars` / `wrangler secret` | Autentica al runner Free.                           |
| `GOOGLE_OAUTH_CLIENT_ID` | **secreto de entorno** | `.dev.vars` / `wrangler secret` | OAuth Web Client de Google.                 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | **secreto** | `.dev.vars` / `wrangler secret` | Secreto OAuth de Google.                    |
| `MERCADO_PAGO_ACCESS_TOKEN` | **secreto** | `.dev.vars` / `wrangler secret` | Credencial server-side del ambiente de Mercado Pago. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | **secreto** | `.dev.vars` / `wrangler secret` | Firma HMAC configurada en Webhooks de Mercado Pago; es obligatoria fuera del modo TEST. |
| `MERCADO_PAGO_TEST_MODE` | var temporal | `.dev.vars` / ambiente remoto de prueba | `1` habilita únicamente el checkout técnico y permite conciliar el webhook consultando al proveedor mientras se obtiene la firma sandbox. Debe ser `0` para cobros reales. |
| `PUBLIC_WEB_URL`      | var             | wrangler.toml                 | Origen canónico del frontend.                        |
| `PUBLIC_API_URL`      | var             | wrangler.toml                 | Origen canónico del Public API y callback OAuth.     |
| `FREE_SITE_BASE_DOMAIN` | var           | wrangler.toml                 | Dominio wildcard de las páginas Free.                |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` | var   | wrangler.toml                 | Remitente y respuesta transaccional.                 |
| `EMAIL`               | binding email   | wrangler.toml                 | Cloudflare Email Service.                            |
| `DB`                  | binding D1      | wrangler.toml                 | Base de datos.                                       |
| `MEDIA`               | binding R2      | wrangler.toml                 | Bucket de archivos.                                  |

## Admin API Worker

| Clave                  | Tipo        | Dónde         | Descripción                                                 |
| ---------------------- | ----------- | ------------- | ----------------------------------------------------------- |
| `ALLOWED_ORIGINS`      | var         | wrangler.toml | Origen del admin-web (con credentials).                     |
| `MEDIA_BASE_URL`       | var         | wrangler.toml | CDN de R2 para previsualizar imágenes.                      |
| `MEDIA_BUCKET_NAME`    | var         | wrangler.toml | Nombre lógico del bucket (se guarda en FileAsset).          |
| `PUBLIC_API_URL`       | var         | wrangler.toml | Fallback para previsualizar imágenes vía `/media`.          |
| `PROJECT_SLUG`         | var         | wrangler.toml | Slug del proyecto.                                          |
| `ACCESS_TEAM_DOMAIN`   | var         | wrangler.toml | `https://<tuorg>.cloudflareaccess.com`.                     |
| `ACCESS_AUD`           | var         | wrangler.toml | AUD tag de la aplicación de Access.                         |
| `AUTO_PROVISION_ADMINS`| var         | wrangler.toml | `1` = crear AdminUser (viewer) al primer login.             |
| `ACCESS_DISABLED`      | var         | wrangler.toml | `1` en local para saltar Access (usa `X-Dev-Email`).        |
| `DB` / `MEDIA`         | bindings    | wrangler.toml | D1 y R2 (mismos recursos que el público).                   |

> El Admin API **no necesita secretos**: Access se valida con claves públicas
> (JWKS) descargadas del dominio del equipo.

## Monorepo (`.env` raíz)

| Variable                | Descripción                                      |
| ----------------------- | ------------------------------------------------ |
| `PROJECT_SLUG`          | Slug base para nombrar recursos.                 |
| `CLOUDFLARE_ACCOUNT_ID` | Para scripts de aprovisionamiento.               |
| `CF_ACCESS_TEAM_DOMAIN` | Dominio del equipo de Access.                    |

## Gestionar secretos en remoto

```bash
cd workers/public-api
npx wrangler@4.105.0 secret put TURNSTILE_SECRET_KEY
npx wrangler@4.105.0 secret put FREE_RUNNER_TOKEN
npx wrangler@4.105.0 secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler@4.105.0 secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler@4.105.0 secret put MERCADO_PAGO_ACCESS_TOKEN
npx wrangler@4.105.0 secret put MERCADO_PAGO_WEBHOOK_SECRET
```

Para staging administrado, genera artefactos desde un perfil local y carga los
secretos contra el `wrangler.toml` generado en `.deploy/<slug>/`. El valor del
secreto se pega cuando Wrangler lo pide; no debe escribirse en la linea del
comando ni guardarse en el perfil.
