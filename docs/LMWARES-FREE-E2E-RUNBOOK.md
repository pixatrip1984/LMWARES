# LMWares Free: estado E2E y puerta de producción

Fecha de validación local: 2026-07-28

Repositorio: `C:\dev\oracle`

Rama: `cloudflare-starter-v01`

## Regla de publicación para todos los planes

Free, Starter y Pro se despliegan primero en `slug.lmwares.com`. Free permanece
en ese esquema. Starter y Pro pueden migrar después a un dominio personalizado,
sin perder necesariamente el subdominio administrado de LMWares. Este patrón
común de entrada pública no cambia el aislamiento técnico previsto para los
proyectos pagados.

## Resultado actual

El flujo Free ya funciona localmente de extremo a extremo con una sesión
persistida:

1. La cuenta autenticada crea la solicitud.
2. El backend ignora un email alterado en el navegador y usa el email de la
   identidad.
3. La solicitud queda ligada a `user_id`.
4. Otra cuenta recibe `404` al intentar leer o modificar la solicitud.
5. Las imágenes JPG, PNG o WebP se guardan como originales privados.
6. El runner descarga cada original por una ruta interna autenticada.
7. Sharp corrige orientación, limita dimensiones, elimina metadatos y reencoda
   a WebP.
8. El HTML sólo referencia derivados sanitizados.
9. El sitio se publica en R2 y D1 registra una URL
   `https://<slug>.lmwares.com`.
10. La publicación crea, en la misma transacción D1, una notificación
    idempotente.
11. El runner despacha el email con Cloudflare Email Service y marca el intake
    como `notified`.
12. El Worker puede resolver el sitio por el host `<slug>.lmwares.com`.
13. El frontend consulta el estado y muestra la URL cuando está disponible.

La validación local más reciente publicó:

- Intake: `e04fde6f-ebe1-46b9-9953-acbf2c3695d0`
- Slug: `free-auth-e2e-1785283271587`
- Asset: `sanitized`
- Job: `succeeded`
- Intake: `notified`
- Email simulado: `sent`, intento `1`
- Host wildcard simulado mediante `Host`: HTTP `200`

El binding de correo de Wrangler fue local y simulado; no se envió un mensaje
real.

## OAuth implementado

Google usa Authorization Code server-side con:

- scopes `openid profile email`;
- redirect URI exacto;
- `state` de un solo uso;
- PKCE S256;
- nonce;
- validación de firma RS256 contra los JWKS de Google;
- validación de `iss`, `aud`, `exp`, `nonce`, `sub`, email y
  `email_verified`;
- `sub` como identidad externa estable;
- cookie HttpOnly, SameSite Lax y Secure cuando el Public API usa HTTPS;
- token de sesión aleatorio guardado sólo como hash SHA-256 en D1;
- logout y revocación de sesión.

No se conservan access tokens ni refresh tokens de Google.

## Lo que falta para declarar Free aprobado en producción

No se debe avanzar a la revisión de módulos Starter hasta pasar estas cuatro
pruebas reales:

1. **Google OAuth**
   - Crear un OAuth Web Client en Google Cloud.
   - Registrar exactamente:
     - local: `http://127.0.0.1:8887/auth/google/callback`;
     - producción: `<PUBLIC_API_URL>/auth/google/callback`.
   - Cargar `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET`.
   - Probar login, callback, refresh de página y logout con una cuenta real.

2. **Cloudflare Email Service**
   - Onboardear `lmwares.com` en Email Sending.
   - Confirmar SPF, DKIM y DMARC.
   - Verificar `notificaciones@lmwares.com`.
   - Enviar una publicación de prueba a una dirección real controlada.
   - Revisar inbox, spam y logs del proveedor.

3. **Wildcard de publicación**
   - Configurar DNS proxy y ruta Worker para `*.lmwares.com/*`.
   - Confirmar HTTPS y certificado wildcard.
   - Abrir la URL real desde una red externa.
   - Confirmar que el original de R2 sigue devolviendo `404`.

4. **Protecciones públicas**
   - Cargar el secreto real de Turnstile.
   - No definir `TURNSTILE_DISABLED=1` en ningún ambiente remoto.
   - Usar un `FREE_RUNNER_TOKEN` remoto largo y distinto del local.
   - Probar límites y errores con una segunda cuenta.

## Configuración

Variables no secretas del Worker:

- `PUBLIC_WEB_URL`
- `PUBLIC_API_URL`
- `FREE_SITE_BASE_DOMAIN`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`

Secretos:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `TURNSTILE_SECRET_KEY`
- `FREE_RUNNER_TOKEN`

El `wrangler.toml` versionado conserva URLs de loopback para desarrollo. No se
debe desplegar sin generar o ajustar la configuración del ambiente remoto con
los orígenes HTTPS reales.

Comandos remotos, ejecutados desde `workers/public-api`:

```powershell
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put FREE_RUNNER_TOKEN
```

Antes del despliegue:

```powershell
npm run typecheck
npm run build
npm run lmwares:free:test
npm run check:workers
npm run db:migrate:remote
```

## Operación del runner

Cada ejecución procesa un job de generación. Si no hay jobs, intenta despachar
una notificación pendiente. Después de publicar, también intenta despachar el
email recién creado.

```powershell
$env:LMWARES_PUBLIC_API_URL = "https://api.lmwares.com"
$env:LMWARES_FREE_RUNNER_TOKEN = "<secreto>"
npm run lmwares:free:run
```

La tabla `lmw_notifications` evita crear dos emails para la misma publicación
mediante `dedupe_key`. Los errores transitorios usan lease y reintentos con
backoff; los errores permanentes quedan registrados para revisión.

## Secuencia del proyecto

La puerta activa sigue siendo Free:

1. Free real aprobado.
2. Revisión E2E de módulos hasta Starter.
3. Suscripciones y cobros programados de LMWares.
4. Reutilización de pagos para Carrito.
5. Flujo base de Optimization.
6. Lanzamiento público.
