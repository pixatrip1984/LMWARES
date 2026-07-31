# LMWares Free: estado E2E y puerta de producción

Fecha de validación local: 2026-07-28

Fecha de aprobación remota: 2026-07-31

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

## Wildcard remoto validado

Fecha: 2026-07-30

El dominio administrado ya resuelve hostnames nuevos hacia el Public API Worker:

- DNS proxy `*.lmwares.com`;
- ruta `*.lmwares.com/*` hacia `starter-public-api`;
- HTTPS válido en un hostname aleatorio;
- respuesta controlada `404 Sitio Free no encontrado` para un slug inexistente;
- 16 subdominios proxy preexistentes protegidos mediante rutas exactas sin
  script;
- los 16 conservaron el mismo código HTTP antes y después de activar el
  wildcard;
- Worker desplegado al 100% con la versión
  `7cc90f39-3e61-4ae7-9240-254d2a80e3ad`.

La base D1 remota todavía no contenía sitios Free publicados al cerrar esta
prueba. Falta publicar el primer sitio real y comprobar su HTML desde una red
externa; el wildcard por sí solo no valida el runner ni la notificación.

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

## Aprobación remota del flujo Free

El 2026-07-31 se completó una publicación real de extremo a extremo con una
cuenta autenticada:

- sitio: `https://ferreteria-garcia-industrial-0731.lmwares.com/`;
- referencia: `e4516d78-48b7-423b-aee1-37d00466ff2a`;
- composición seleccionada: `Impacto`;
- paleta seleccionada: `Industrial`;
- cinco imágenes cargadas, sanitizadas y publicadas;
- ubicación seleccionada desde el buscador OpenStreetMap y mapa visible en el
  sitio publicado;
- Turnstile completado en el formulario público;
- URL final mostrada por el configurador;
- sitio registrado en `Mis sitios`;
- cada sitio publicado muestra en `Mis sitios` un QR local de su URL y permite
  descargarlo como PNG de 768×768 para compartir o imprimir;
- notificación interna disponible en el centro de cuenta;
- correo transaccional recibido con enlace y datos de entrega;
- sitio abierto correctamente desde el subdominio wildcard con HTTPS.

Con esta evidencia queda aprobada la ruta funcional principal de Free en
producción y se abre la puerta de revisión E2E de módulos Starter.

## Puertas de producción completadas

Las cuatro puertas previstas se probaron de esta forma:

1. **Google OAuth**
   - Authorization Code con PKCE probado con una cuenta real.
   - Sesión persistida y asociada al configurador, notificaciones y sitios.

2. **Cloudflare Email Service**
   - Correo real recibido después de la publicación.
   - El mensaje contiene la URL y los datos de la entrega Free.

3. **Wildcard de publicación**
   - DNS proxy, ruta Worker, HTTPS y aislamiento de subdominios existentes:
     aprobado el 2026-07-30.
   - Primera publicación Free real abierta correctamente el 2026-07-31.

   No se debe crear la ruta amplia directamente. `lmwares.com` ya contiene
   subdominios administrados por Pages, Workers y otros orígenes. Antes de
   activar el wildcard se deben crear rutas exactas sin script para todos los
   hosts proxy existentes; esas rutas más específicas conservan sus orígenes.
   El configurador aplica el orden seguro: exclusiones, DNS wildcard y ruta
   wildcard al final.

   ```powershell
   npm run lmwares:wildcard:audit
   npm run lmwares:wildcard:apply
   npm run lmwares:wildcard:audit
   ```

   El token usado por `CLOUDFLARE_API_TOKEN` requiere, como mínimo, lectura de
   zona/DNS, edición de DNS y `Workers Routes Read`/`Workers Routes Write` para
   `lmwares.com`. El script nunca imprime el token.

   Después de aplicar las exclusiones, `workers/public-api/wrangler.toml`
   conserva `*.lmwares.com/*` como fuente de verdad del Worker. No se debe
   eliminar esa ruta en despliegues posteriores ni crear el wildcard a mano sin
   ejecutar antes la auditoría.

4. **Protecciones públicas**
   - Turnstile real completado durante la publicación aprobada.
   - El entorno remoto conserva el runner autenticado y sin bypass público.

## Robustez pendiente, no bloqueante para Starter

Estas pruebas permanecen como regresión operativa antes del lanzamiento público
general, pero no bloquean la revisión de módulos Starter:

- reintentar una solicitud interrumpida sin duplicar sitio ni notificación;
- comprobar límites y aislamiento con una segunda cuenta real;
- auditar periódicamente que los originales privados de R2 no sean públicos;
- confirmar que un fallo transitorio de correo se recupere mediante backoff.

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
