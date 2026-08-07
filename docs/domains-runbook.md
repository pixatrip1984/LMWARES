# Runbook: dominios personalizados (Cloudflare for SaaS)

Este runbook documenta cómo activar y operar dominios propios de clientes
Starter sobre `Cloudflare for SaaS` (Custom Hostnames), y cómo permanece el
sistema cuando ese proveedor todavía no está habilitado. El subdominio
administrado `slug.lmwares.com` nunca se reemplaza: es el fallback permanente
de revisión y recuperación.

## 1. Modelo de proveedores

El núcleo de dominios (`packages/domain/src/custom-domain-provider.ts` y
`cloudflare-saas-domain-provider.ts`) es agnóstico al proveedor:

- `DOMAIN_PROVIDER = "manual"` (default): `ManualCnameDomainProvider` sólo
  genera instrucciones DNS (CNAME + TXT) y dispara verificación manual desde
  el admin. No hace llamadas de red ni genera costo.
- `DOMAIN_PROVIDER = "cloudflare-saas"`: `CloudflareSaasDomainProvider` crea,
  consulta y elimina Custom Hostnames reales contra la zona `lmwares.com`.
  Cloudflare emite el certificado automáticamente al detectar el CNAME válido.

Cambiar de proveedor no requiere migración: la tabla `lmw_custom_domains`
guarda `provider` y `external_id` por registro, así que ambos modos pueden
coexistir históricamente.

## 2. Configuración one-time en el dashboard de Cloudflare (manual, fuera del agente)

Estos pasos los hace el usuario directamente en `dash.cloudflare.com`, zona
`lmwares.com`:

1. Activar **Cloudflare for SaaS** en la zona (SSL/TLS → Custom Hostnames →
   Enable).
2. Crear un registro DNS proxied dedicado para el origen de reserva, por
   ejemplo `saas-origin.lmwares.com` como CNAME hacia `api.lmwares.com`, y
   esperar que quede `Active` (no `Initializing`).
3. Designar ese registro como **Fallback Origin** en la configuración de
   Custom Hostnames.
4. Crear un CNAME SaaS proxied, por ejemplo `customers.lmwares.com`, apuntando
   al mismo fallback origin. Ese hostname completo es el valor de
   `CLOUDFLARE_SAAS_CNAME_TARGET`.
5. Generar un API Token acotado sólo a esa zona con permiso
   `Zone → SSL and Certificates → Edit` (cubre Custom Hostnames). No usar un
   token de cuenta completa.
6. Copiar el **Zone ID** de `lmwares.com` (visible en el resumen de la zona).

Estado actual verificado en este repo: pasos 1-6 completados. El origen de
reserva y el CNAME SaaS están activos, y el zone ID ya vive como variable no
sensible en ambos `wrangler.toml`.

## 3. Dónde pegar cada secreto/variable

| Nombre | Tipo | Dónde vive | Worker(s) |
| --- | --- | --- | --- |
| `DOMAIN_PROVIDER` | var | `wrangler.toml` (`[env.production.vars]`) | Public API |
| `CLOUDFLARE_ZONE_ID` | var (no sensible) | `wrangler.toml` | Public API y Admin API |
| `CLOUDFLARE_SAAS_CNAME_TARGET` | var (no sensible) | `wrangler.toml` | Public API y Admin API |
| `CLOUDFLARE_SAAS_API_TOKEN` | **secreto** | `wrangler secret put` (nunca en `wrangler.toml`, D1, logs o docs) | Public API y Admin API |
| `NAMESILO_API_KEY` | **secreto** (fase futura, aún no integrada) | `wrangler secret put` cuando se habilite la compra de dominios | Public API |

Comando para cargar el secreto en cada Worker (ejecutar por separado en cada
uno, sin imprimir el valor):

```powershell
cd workers/public-api
npx wrangler@4.105.0 secret put CLOUDFLARE_SAAS_API_TOKEN --env production

cd ../admin-api
npx wrangler@4.105.0 secret put CLOUDFLARE_SAAS_API_TOKEN --env production
```

El CLI pide pegar el valor de forma oculta (por eso en terminal sólo se ve un
`*`); el secreto sí se recibe completo aunque la máscara visual muestre un
solo carácter. Nunca lo repitas por chat ni lo guardes en un archivo del repo.

Verificar que el nombre del secreto quedó registrado (sin leer su valor):

```powershell
npx wrangler@4.105.0 secret list --env production
```

## 4. Flujo del cliente (Public API / `apps/public-web`)

1. El cliente entra a "Mi cuenta" → panel de dominios
   (`AccountCenterModal.tsx` → `CustomDomainsPanel`), disponible sólo cuando
   el work order está en `ready_to_publish` o `live`.
2. Elige tipo `www` o `app` (un slot por tipo) e introduce su hostname.
3. `POST /starter-projects/:clientProjectId/domains` llama al provider
   configurado, guarda el registro en `pending_verification` con el
   `external_id` de Cloudflare (si aplica) y devuelve las instrucciones DNS
   (CNAME + TXT de propiedad) **una sola vez** (`oneTime: true`); el token de
   verificación sólo se guarda como hash.
4. El cliente configura el CNAME hacia `customers.lmwares.com` y el TXT en su
   proveedor DNS.
5. El admin confirma la verificación (paso 5). Cloudflare emite el
   certificado automáticamente; no hay un "activar" explícito en su API.
6. El estado visible progresa: `pending_verification` → `verified` →
   `provisioning` → `active`. Sólo `active` permite servir contenido; el
   router público (`workers/public-api/src/index.ts`) rechaza cualquier otro
   estado y sigue resolviendo `slug.lmwares.com` como fallback.

## 5. Flujo del admin (`apps/admin-web/src/pages/StarterDomainsPage.tsx`)

- **Verificar** (`POST /admin/starter-domains/:domainId/verify`): si el
  proveedor es `manual-cname`, confirma manualmente. Si es `cloudflare-saas`,
  consulta el estado real (`getStatus`) y lo sincroniza en D1; devuelve error
  explícito si Cloudflare todavía no confirmó la propiedad
  (`pending_verification`) o si falló la validación/emisión (`failed`).
- **Retirar** (`DELETE /admin/starter-domains/:domainId`): si hay proveedor
  externo, primero llama `remove()` (elimina el Custom Hostname en
  Cloudflare) y sólo después marca el registro local como `removed`.
- Toda acción admin queda auditada (`lmwares.custom_domain.admin_verify`,
  `lmwares.custom_domain.admin_remove`) con hostname y estado, sin exponer el
  token ni la respuesta cruda del proveedor.

## 6. Criterio de activación gradual

No cambiar `DOMAIN_PROVIDER` a `cloudflare-saas` en un entorno hasta que:

1. El origen de reserva y el CNAME SaaS estén `Active` en el dashboard (no
   `Initializing`).
2. `CLOUDFLARE_SAAS_API_TOKEN` exista como secreto en **ambos** Workers
   (`wrangler secret list --env production` lo confirma por nombre).
3. Se haya probado el flujo completo contra **un hostname propio de prueba**
   (por ejemplo un subdominio de un dominio que ya controlemos), nunca
   directamente contra el primer dominio real de un cliente.
4. El preflight (`scripts/lmwares-commercial-preflight.ps1`) reporte
   `D1_ACTIVE_DOMAINS_WITHOUT_CERTIFICATE_OR_PROJECT=OK`.

Mientras cualquiera de estas condiciones falte, mantener `DOMAIN_PROVIDER =
"manual"` en ese entorno: no genera llamadas externas ni costo, y el cliente
puede seguir operando bajo `slug.lmwares.com`.

## 7. Diagnóstico de fallos conocidos

- **"El proveedor de dominios no respondió a tiempo."** — El adaptador
  (`cloudflare-saas-domain-provider.ts`) convierte cualquier fallo de
  `fetch()` (timeout real, abort, error de red) en este mismo mensaje.
  `register()` ya es idempotente por hostname: antes de crear, reconcilia
  contra Cloudflare (`GET .../custom_hostnames?hostname=...`) y adopta el
  recurso existente si un intento anterior ya lo creó, así que un reintento
  después de este error no genera un Custom Hostname duplicado ni huérfano.
  Si igual aparece un huérfano (por ejemplo, creado manualmente en el
  dashboard fuera de este flujo):
  1. Verificar en el dashboard (SSL/TLS → Custom Hostnames) si el hostname
     ya existe como recurso externo sin fila local en `lmw_custom_domains`.
  2. Si existe, asociarlo manualmente (backfill de `external_id`) o
     eliminarlo desde el dashboard antes de reintentar.
  3. Pendiente en el plan (mejora, no bloqueante): distinguir en los logs
     timeout / abort / error de red / 403 / 409 / 429 en vez de colapsarlos
     todos al mismo mensaje genérico.
- **Certificado nunca llega a `active`** — Revisar `ssl.validation_records`
  vía `getStatus`; el CNAME o el TXT de validación de Cloudflare puede faltar
  o estar mal escrito en el DNS del cliente. El estado interno queda en
  `provisioning` o `failed` (ver `mapCloudflareStatus`).
- **Dominio activo sin certificado ni proyecto** — Indicador de integridad en
  el preflight (`D1_ACTIVE_DOMAINS_WITHOUT_CERTIFICATE_OR_PROJECT`); no debe
  ocurrir en operación normal y bloquea el gate si aparece.

## 8. Namesilo: registrador de dominios (compra + DNS)

Estado: adaptador (`NamesiloDomainRegistrar`) y migración de esquema
implementados y probados; **aún no habilitado en producción real**. Sólo
aplica al cliente que **no** tiene dominio propio y quiere comprarlo vía
LMWares (mantenimiento `basic`/`advanced`); el cliente que ya tiene su
dominio sigue usando el flujo manual de las secciones 1-7 sin tocar Namesilo.

- **Piezas separadas por diseño**: `DomainProvider` (Cloudflare for SaaS)
  resuelve *cómo* un hostname externo llega con HTTPS a nuestro Worker.
  `DomainRegistrar` (Namesilo) resuelve *quién es dueño del dominio y sus
  registros DNS*. `packages/domain/src/models/domain-registrar.ts` define la
  interfaz; `packages/domain/src/namesilo-domain-registrar.ts` es el
  adaptador real contra `https://www.namesilo.com/api` (GET autenticado por
  `key` en query string, `version=1&type=json`, nunca logueado). El parseo
  puro de las respuestas XML→JSON (que a veces no vienen como arreglo cuando
  hay un solo resultado) vive en `packages/domain/src/namesilo-response-parsing.ts`.
- **Gate de activación**: `DOMAIN_REGISTRAR_PROVIDER = "manual" | "namesilo"`
  (default `manual` en ambos entornos de `workers/public-api/wrangler.toml`).
  Mientras permanezca en `manual`, la factory
  `workers/public-api/src/lib/domain-registrar-factory.ts` devuelve un
  registrador inerte que rechaza toda operación con un mensaje claro; no se
  hace ninguna llamada externa ni se genera ningún cargo.
- **Apex/root domains**: un dominio comprado (ej. `shynolaser.com`, sin
  subdominio) usa `type = 'apex'` en `lmw_custom_domains` (migración
  `0035_lmwares_custom_domain_apex_registrar.sql`, patrón rebuild-table) y un
  registro `ALIAS` (no `CNAME`, inválido en el apex) apuntando al mismo
  `CLOUDFLARE_SAAS_CNAME_TARGET` ya configurado. Las filas creadas por este
  flujo guardan además `registrar` y `registrar_order_id` (nulos para
  dominios que el cliente ya tenía y sólo verificó manualmente).
- **Secreto**: `NAMESILO_API_KEY`, sólo en `workers/public-api`, nunca
  expuesto al admin-api ni al navegador.
  ```
  cd workers/public-api
  npx wrangler secret put NAMESILO_API_KEY --env production
  ```
- **Antes de habilitar `namesilo` en producción real**: validar la forma
  exacta de la respuesta contra el sandbox de Namesilo (el código está
  escrito con base en la documentación pública, marcado explícitamente como
  pendiente de esa validación) y probar una compra real contra un dominio
  barato que controle el negocio, con el mismo rigor que el cobro real de
  $1 MXN de Mercado Pago. Sólo entonces habilitar para clientes reales.
- **Pendiente** (todos separados en el plan, aún no implementados): endpoints
  `/domains/search` y `/domains/purchase` (`domain-search-purchase-flow`),
  modal de búsqueda/compra en `AccountCenterModal` (`domain-search-ui`), e
  indexación Google condicionada al dominio propio activo
  (`google-indexing-integration`, `google-site-verification-custom-domains`).
- No ejecutar ninguna compra ni registro real hasta que el usuario lo apruebe
  explícitamente con la cuenta/API key real de Namesilo.

## 9. Guardrails permanentes

- El subdominio `slug.lmwares.com` nunca se elimina al activar un dominio
  propio.
- Ningún dominio en estado distinto de `active` puede servir contenido en el
  router público.
- No se guardan tokens, secretos ni respuestas crudas del proveedor/registrador
  en D1, logs, frontend o este repositorio.
- Los tokens de Cloudflare/Namesilo se generan y pegan directamente por el
  usuario cuando esté listo para probar contra producción real; el agente no
  los crea ni los imprime.
