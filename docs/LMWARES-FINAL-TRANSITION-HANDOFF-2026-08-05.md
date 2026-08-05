# Handoff final de transición: LMWares + Oracle

Fecha de corte: **2026-08-05**  
Repositorio principal: `C:\dev\oracle`  
Rama activa: `cloudflare-starter-v01`  
HEAD confirmado: `0e64da2c3e5d039450ba8eb377d3b8e39e947faa` (`complete Starter docs and gallery lifecycle`)

Este documento está escrito para que un agente nuevo pueda continuar sin reconstruir
la conversación completa. Resume el estado observado en el código, distingue lo
probado de lo pendiente y señala la documentación canónica que debe leer.

## 0. Instrucción de arranque para el siguiente agente

Antes de modificar, desplegar o limpiar:

1. Leer este documento completo.
2. Ejecutar `git status --short --branch` y `git diff --stat`.
3. Leer, en este orden:
   - [`LMWARES-COMMERCIAL-FLOW-ON-GO-LIVE.md`](./LMWARES-COMMERCIAL-FLOW-ON-GO-LIVE.md)
   - [`LMWARES-FREE-E2E-RUNBOOK.md`](./LMWARES-FREE-E2E-RUNBOOK.md)
   - [`LMWARES-MODULES-HANDOFF-2026-07-28.md`](./LMWARES-MODULES-HANDOFF-2026-07-28.md)
   - [`LMWARES-SUBSCRIPTIONS-ORACLE-VISION.md`](./LMWARES-SUBSCRIPTIONS-ORACLE-VISION.md)
   - [`LMWARES-ORACLE-ARCHITECTURE.md`](./LMWARES-ORACLE-ARCHITECTURE.md)
4. No ejecutar `git reset --hard`, `git checkout --`, `git clean`, `git add .` ni
   una migración o despliegue remoto hasta clasificar el bloque sin commit descrito
   en la sección 2.
5. No abrir, copiar, imprimir ni incluir en prompts el contenido de `.env`,
   `.dev.vars`, secretos de Wrangler, tokens de Cloudflare, credenciales de Google
   ni credenciales de Mercado Pago. Sólo deben manejarse por nombre y por el canal
   secreto correspondiente.

## 1. Qué es el sistema y cuál es la dirección vigente

LMWares es el servicio comercial. Oracle es la capa local de registro, revisión,
ejecución asistida, evidencia y operación de proyectos. Los sitios se construyen
sobre una base Cloudflare-first con Pages, Workers, D1, R2, Access, Turnstile y
Email Service.

Decisiones de producto vigentes:

- Todos los planes empiezan en un subdominio `*.lmwares.com`.
- Free permanece en ese esquema; Starter y Pro pueden migrar después a un dominio
  personalizado.
- Free es determinista y no necesita IA para generar cada sitio. Usa plantillas,
  composiciones, paletas, imágenes sanitizadas y ubicación OpenStreetMap.
- Starter y Pro mantienen revisión y ejecución humanas. Oracle no está autorizado
  a publicar, cobrar, crear recursos pagados o aceptar alcance sin supervisión.
- Starter incluye Landing + Panel y permite hasta dos complementos disponibles.
- Pro permite combinar más módulos disponibles, pero no convierte automáticamente
  en disponibles las integraciones todavía no lanzadas.
- Carrito y Optimization se muestran como **Próximamente** y están bloqueados tanto
  en UI como en el contrato de dominio del bloque local actual.
- Marketing general también se anuncia como **Próximamente**. Se ofrecerá a cualquier
  negocio. AstraMuses empezará produciendo contenido SaaS UGC para promocionar
  LMWares, pero AstraMuses no se vende ni se cobra en el lanzamiento inicial.
- El mantenimiento es opcional. Una oferta con `monthly_amount_cents = 0` es pago
  único y no debe crear suscripción ni renovación.
- Si una oferta incluye mantenimiento, la mensualidad se autoriza cuando el proyecto
  está listo para publicar, no durante la construcción.

La relación con otros repositorios debe mantenerse explícita:

- `C:\dev\oracle`: LMWares/Oracle y la plataforma compartida.
- `C:\dev\shynolaser.mx`: proyecto cliente separado; Oracle lo registra y puede
  lanzar agentes sobre él, pero no comparte su Git.
- AstraMuses vive en un repositorio separado. No existe una conexión de código que
  autorice a modificarlo desde Oracle. Su uso inicial es promocionar LMWares.

## 2. Estado Git: advertencia crítica

No hay `origin` ni upstream configurado. El único worktree registrado es
`C:\dev\oracle` y la rama activa apunta a `0e64da2`.

En este corte existen **29 archivos rastreados modificados** y estos archivos sin
seguimiento previos al presente documento:

- `.codex-dev/starter-docs-remote-e2e.txt`
- `apps/public-web/src/lib/package-builder-launch.test.mjs`

Además, `.codex-dev/dev.pid` y `.codex-dev/public-web.pid` están modificados; son
artefactos de procesos y no deben mezclarse automáticamente con código de producto.

El diff rastreado observado antes de crear este informe era aproximadamente:

- 871 inserciones;
- 215 eliminaciones;
- 29 archivos.

El bloque sin commit contiene trabajo valioso y coherente, no residuos descartables:

1. Pago único para Starter/Pro cuando la oferta final tiene mantenimiento en cero.
2. Compuerta condicional de publicación: suscripción activa sólo cuando el importe
   mensual es mayor que cero.
3. Correos, notificaciones y centro de cuenta adaptados a entregas sin renovación.
4. Carrito y Optimization cerrados para el lanzamiento, también del lado servidor.
5. AstraMuses no contratable y Marketing general anunciado como próximo.
6. Rediseño del configurador, resumen y las tres pestañas del centro de cuenta.
7. Pruebas de dominio, Public API y UI para esas reglas.
8. Documentación comercial actualizada.

El Public Web fue desplegado directamente desde este worktree sucio; por eso producción
puede estar por delante de `HEAD`. El resto del bloque local no debe darse por desplegado.

### Acción P0 recomendada

Revisar el diff por grupos y crear uno o varios commits intencionales antes de seguir.
Como no existe remoto, establecer además un respaldo recuperable antes de una limpieza.
No incluir archivos de secretos ni asumir que los PID merecen commit.

## 3. Superficies y URLs canónicas

| Superficie | URL / ruta | Estado conocido |
| --- | --- | --- |
| Sitio y configurador | `https://contratar.lmwares.com` | Publicado en Pages |
| Public API | `https://api.lmwares.com` | Worker productivo |
| Admin | `https://admin.lmwares.com` | Protegido por Cloudflare Access |
| Sitios Free/Starter | `https://<slug>.lmwares.com` | Wildcard Worker activo |
| Public Web local | `http://127.0.0.1:5273` | Se levanta bajo demanda |
| Admin Web local | `http://127.0.0.1:5274` | Se levanta bajo demanda |
| Public API local | `http://127.0.0.1:8887` | Se levanta bajo demanda |
| Admin API local | `http://127.0.0.1:8888` | Se levanta bajo demanda |

Último despliegue de Public Pages realizado en este corte:

- proyecto: `lmwares-public`;
- rama de producción: `main`;
- preview inmutable: `https://056e5583.lmwares-public.pages.dev`;
- bundle JS construido: `assets/index-DI91stJC.js`;
- dominio esperado: `https://contratar.lmwares.com`.

La última modificación fue texto comercial y UI. Conviene verificar de nuevo el dominio
limpio, sin parámetro de cache-bust, antes de anunciar un release formal.

No se identificó `Dockerfile`, `docker-compose` ni dependencia operativa de Docker en
este repositorio. El desarrollo local usa npm, Turbo, Wrangler y D1/R2 locales.

## 4. Estado por flujo

### 4.1 Free: aprobado en producción

El flujo principal está aprobado con evidencia real:

- Google OAuth Authorization Code + PKCE;
- sesión HttpOnly ligada al usuario;
- Turnstile validado en el Worker;
- imágenes originales privadas y derivados WebP sanitizados;
- generación determinista con estilos y paletas;
- selector y mapa OpenStreetMap;
- publicación en wildcard HTTPS;
- URL mostrada al cliente;
- notificación dentro de la cuenta;
- email transaccional real;
- listado en `Mis sitios`;
- QR visible y descargable.

Fuente detallada: [`LMWARES-FREE-E2E-RUNBOOK.md`](./LMWARES-FREE-E2E-RUNBOOK.md).

Pendientes no bloqueantes de robustez Free:

- reintento de una ejecución interrumpida sin duplicados;
- aislamiento con una segunda cuenta real;
- auditoría periódica de originales privados en R2;
- recuperación de correo ante un fallo transitorio;
- política de retención, moderación y uso aceptable.

### 4.2 Starter: módulos y operación

La base compartida incluye Landing y Panel. Los complementos anunciados como
disponibles son:

- Blog;
- Galerías;
- Catálogo;
- Formulario/Cotizador;
- Eventos;
- Docs.

Module Studio implementa y prueba de forma genérica Blog, Galerías, Docs, Formularios
y Eventos. Los cinco completaron ciclos locales; existen snapshots públicos inmutables,
separación borrador/publicación y validadores reproducibles. El commit `0e64da2`
completa el ciclo de Docs y Galerías.

El handoff histórico de módulos acumula actualizaciones en la parte superior, pero sus
secciones antiguas todavía afirman que no hubo despliegue remoto o que faltaban gestos
manuales de Galerías/Docs. Esas afirmaciones son históricas y no deben leerse aisladas.
Usar el historial superior y `HEAD`, y revalidar producción si la decisión depende de
esa evidencia.

Catálogo y Cotizador/Formulario se han trabajado especialmente en ShynoLaser. Catálogo
no debe darse por convertido en un módulo genérico equivalente a los cinco verticales
de Module Studio sin revisar el repositorio cliente.

Fuente principal: [`LMWARES-MODULES-HANDOFF-2026-07-28.md`](./LMWARES-MODULES-HANDOFF-2026-07-28.md).

### 4.3 Pro y alcance del lanzamiento inicial

Pro se vende como una combinación ampliada de los módulos Starter disponibles. En el
bloque local actual:

- Carrito (`cart`) está anunciado pero no seleccionable;
- Optimization (`data`) está anunciado pero no seleccionable;
- las peticiones manipuladas con esos módulos se rechazan en dominio/API;
- Marketing/AstraMuses no puede incluirse ni cobrarse;
- los borradores antiguos se normalizan para retirar módulos o marketing no disponibles.

Esto evita vender capacidades todavía no listas. Carrito será probablemente la primera
integración posterior al lanzamiento; Optimization queda fuera del lanzamiento inicial.

### 4.4 AstraMuses y Marketing

Decisión vigente:

- AstraMuses no se lanza como producto junto con LMWares.
- LMWares lo usará inicialmente para sus propias campañas SaaS UGC.
- Marketing general se ofrecerá después a cualquier negocio.
- Copy actual del configurador: campañas para redes, posts y reels promocionales,
  anuncios clásicos y cinemáticos, y UGC personalizado con influencers sintéticos.
- Todo aparece como **Próximamente**, sin precio ni selector.

No modificar el repositorio AstraMuses desde este repositorio salvo autorización
explícita y una tarea separada.

## 5. Pagos y suscripciones

### 5.1 Ensayo técnico de suscripciones

Checkout Pro y Suscripciones usan aplicaciones, Access Tokens y secretos Webhook
separados. El sandbox recurrente se validó con Seller TEST + Buyer TEST compatible.

Evidencia histórica:

- preapproval autorizado;
- próximo cobro informado por Mercado Pago;
- un cargo autorizado aprobado y conciliado;
- idempotencia confirmada por `provider_authorized_payment_id`;
- Webhook de simulación firmado con respuesta 200.

La prueba de cancelación y el siguiente débito programado permanecían como gates. La
documentación registra una siguiente fecha el 30 de agosto de 2026; no asumir que la
suscripción sigue activa ni cancelarla sin consultar primero el estado real y obtener
autorización.

Fuentes:

- [`LMWARES-PAYMENTS-HANDOFF-2026-07-29.md`](./LMWARES-PAYMENTS-HANDOFF-2026-07-29.md)
- [`LMWARES-SUBSCRIPTIONS-TECHNICAL-RUNBOOK.md`](./LMWARES-SUBSCRIPTIONS-TECHNICAL-RUNBOOK.md)
- [`MERCADO-PAGO-SUBSCRIPTIONS-SANDBOX-POSTMORTEM-2026-07-30.md`](./MERCADO-PAGO-SUBSCRIPTIONS-SANDBOX-POSTMORTEM-2026-07-30.md)

### 5.2 Pago comercial de implementación

La compuerta comercial productiva está configurada como habilitada:

- `MERCADO_PAGO_COMMERCIAL_PAYMENTS_ENABLED = "1"`;
- `MERCADO_PAGO_COMMERCIAL_TEST_MODE = "0"`;
- Webhook: `https://api.lmwares.com/payments/webhooks/mercado-pago?scope=commercial`.

La evidencia documentada al 2026-08-03 incluía una orden pagada por MXN $10, una
cancelada por MXN $1 y una pendiente por MXN $10; seis Webhooks comerciales procesados
y una orden de trabajo vinculada a `shynolaser.mx` en `in_build`.

Esto valida la tubería técnica de cobro real controlado, no los precios finales ni una
venta completa a un cliente externo.

### 5.3 Pago único y mantenimiento opcional

El bloque sin commit permite que una oferta final tenga mensualidad en cero:

- se cobra sólo la implementación;
- no se crea preapproval de mantenimiento;
- `ready_to_publish` puede pasar a `live` sin suscripción;
- el comprobante y el email declaran que no hay renovaciones;
- si el importe mensual es mayor que cero, se conserva la exigencia de suscripción
  `active` antes de publicar.

Este comportamiento tiene pruebas unitarias verdes, pero la implementación atraviesa
Public API, Admin API, Admin Web y repositorios D1 que **no deben darse por desplegados**
por el despliegue reciente del Public Web.

MG Seguros es el candidato acordado para la primera venta real de pago único: Starter
con Catálogo + Formulario, implementación de MXN $10,900 y mantenimiento en cero. En
este corte sólo existe fixture y política técnica; no hay evidencia en este repositorio
de que el cliente ya haya aceptado y pagado esa oferta real.

### 5.4 Mantenimiento productivo

La creación de mantenimiento permanece cerrada:

- `MERCADO_PAGO_MAINTENANCE_SUBSCRIPTIONS_ENABLED = "0"`;
- `MERCADO_PAGO_MAINTENANCE_TEST_MODE = "0"`;
- Webhook: `https://api.lmwares.com/payments/webhooks/mercado-pago?scope=maintenance`.

No abrir la compuerta por comodidad. Primero debe existir una oferta aceptada con
mensualidad positiva, pago canónico, proyecto real enlazado y estado
`ready_to_publish`.

Fuente canónica: [`LMWARES-COMMERCIAL-FLOW-ON-GO-LIVE.md`](./LMWARES-COMMERCIAL-FLOW-ON-GO-LIVE.md).

## 6. Brecha más urgente: producción y worktree no coinciden

El Public Web más reciente sí fue desplegado desde el bloque sin commit. Por tanto, el
cliente ve:

- Carrito y Optimization como próximos;
- Marketing general como próximo;
- AstraMuses no contratable;
- resumen visual y centro de cuenta rediseñados.

Pero las defensas del servidor y el flujo de pago único están en archivos locales
modificados. Hasta que se revisen, commiteen y desplieguen Public API/Admin API/Admin
Web, existe una transición parcial:

- la UI evita enviar marketing y módulos próximos;
- el backend productivo podría no contener todavía las mismas defensas;
- la publicación de una oferta con mensualidad cero podría seguir bloqueada en
  producción aunque el código local la permita;
- el administrador productivo puede conservar labels y controles anteriores.

Ésta es la prioridad técnica P0 antes de invitar a MG Seguros a pagar.

## 7. Orden recomendado de continuación

### P0 — Consolidar y alinear

1. Respaldar la rama local porque no existe remoto.
2. Revisar los 29 archivos modificados y el test nuevo sin seguimiento.
3. Separar artefactos `.codex-dev` del código de producto.
4. Crear commits revisables para:
   - pago único/mantenimiento opcional;
   - gates de lanzamiento (Carrito, Optimization, AstraMuses);
   - rediseño del configurador y centro de cuenta;
   - documentación y pruebas.
5. Ejecutar typecheck, test, build, validadores D1 y dry-run de Workers.
6. Revisar secretos sólo por presencia, nunca por valor.
7. Desplegar Public API, Admin API y Admin Pages con autorización explícita.
8. Revalidar Public Web en el dominio limpio.

### P1 — Primera venta real de pago único

1. Crear la solicitud real de MG Seguros con Starter + Catálogo + Formulario.
2. Revisar alcance humano y emitir oferta final de MXN $10,900 con mensualidad MXN $0.
3. El cliente acepta desde su cuenta.
4. Crear Checkout Pro usando el importe congelado del servidor.
5. Confirmar pago, Webhook, conciliación, `converted` y una sola orden de trabajo.
6. Enlazar manualmente el proyecto MG Seguros ya existente en Oracle.
7. Construir, revisar con cliente y pasar a `ready_to_publish`.
8. Publicar en `*.lmwares.com` sin crear suscripción.
9. Verificar comprobante dentro de la cuenta y email sin texto de renovaciones.
10. Sólo después considerar el flujo listo para clientes de pago único.

### P2 — Mantenimiento opcional real

1. Definir comercialmente precio, cobertura, SLA, cancelación y gracia.
2. Elegir un cliente que sí quiera mantenimiento.
3. Abrir la compuerta sólo para una prueba controlada.
4. Autorizar suscripción al llegar a `ready_to_publish`.
5. Verificar `active`, publicar y registrar el primer cargo programado.
6. Probar pausa/cancelación y evitar reactivaciones por eventos tardíos.

### P3 — Lanzamiento público

1. Cerrar términos, privacidad, cancelación, reembolsos y tratamiento de datos.
2. Definir retención/moderación de Free.
3. Ejecutar el playbook adversarial y revisar CORS/Access/Turnstile.
4. Añadir observabilidad, procedimiento de rollback y respaldo remoto del código.
5. Lanzar sólo los módulos disponibles.
6. Mantener Carrito, Optimization y Marketing como próximos hasta su gate propio.

## 8. Validación fresca de este corte

Ejecutada el 2026-08-05 sobre el worktree actual:

- `npm run typecheck`: **17/17 tareas correctas**.
- `npm test`: **11/11 tareas Turbo correctas**.
  - dominio: 13 pruebas;
  - Public API: 37 pruebas;
  - Free runner: 6 pruebas;
  - Admin Web: 5 pruebas;
  - Public Web: 11 pruebas.
- `npm run build`: **11/11 tareas correctas**.
- `git diff --check`: sin errores; PowerShell mostró únicamente advertencias de
  conversión futura LF → CRLF.
- Public Web: advertencia no bloqueante por bundle JS de aproximadamente 573 KiB,
  superior al umbral de 500 KiB. Conviene dividirlo después, pero no rompe el build.

La validación D1 `validate-lmwares-maintenance-policy.ps1` **no concluyó en este
corte**:

1. primero falló porque `npx` intentó usar un `npx-cli.js` inexistente bajo AppData;
2. con `npm_config_prefix` corregido llegó a Wrangler, pero quedó sin salida durante
   varios minutos y fue detenido;
3. la carpeta temporal creada por esta ejecución fue retirada de forma selectiva.

Comando de workaround para el siguiente agente:

```powershell
$env:npm_config_prefix = 'C:\Program Files\nodejs'
pwsh -NoProfile -File .\scripts\validate-lmwares-maintenance-policy.ps1
```

Antes de reintentar, revisar procesos Wrangler/Node y posibles bloqueos locales. Las
pruebas unitarias de pago único pasaron, pero no sustituyen esta compuerta D1.

## 9. Comandos seguros de reanudación

Desde `C:\dev\oracle` y usando PowerShell 7:

```powershell
git status --short --branch
git diff --stat
git diff --check
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Para módulos Starter locales:

```powershell
pwsh -NoProfile -File scripts\validate-starter-modules.ps1 -Mode local -ProjectId astraeus
```

Para preflight comercial de sólo lectura:

```powershell
pwsh -NoProfile -File scripts\lmwares-commercial-preflight.ps1 -RequireReady Report
```

No usar `-RequireReady All` como prueba de disponibilidad si no existe todavía una
orden real elegible para mantenimiento; el comando debe fallar en ese caso.

## 10. Documentación: mapa y vigencia

### Leer primero

| Documento | Uso |
| --- | --- |
| [`LMWARES-COMMERCIAL-FLOW-ON-GO-LIVE.md`](./LMWARES-COMMERCIAL-FLOW-ON-GO-LIVE.md) | Flujo comercial, pago, orden de trabajo, publicación y mantenimiento |
| [`LMWARES-FREE-E2E-RUNBOOK.md`](./LMWARES-FREE-E2E-RUNBOOK.md) | OAuth, Turnstile, runner, wildcard, email y evidencia Free |
| [`LMWARES-MODULES-HANDOFF-2026-07-28.md`](./LMWARES-MODULES-HANDOFF-2026-07-28.md) | Module Studio y evolución de Blog/Galerías/Docs/Formularios/Eventos |
| [`LMWARES-SUBSCRIPTIONS-ORACLE-VISION.md`](./LMWARES-SUBSCRIPTIONS-ORACLE-VISION.md) | Misión, visión, planes, producto, seguridad y decisiones comerciales |
| [`LMWARES-ORACLE-ARCHITECTURE.md`](./LMWARES-ORACLE-ARCHITECTURE.md) | Contratos WARE, límites Oracle/remoto, fases y gates |

### Operación especializada

| Documento | Uso |
| --- | --- |
| [`LMWARES-PAYMENTS-HANDOFF-2026-07-29.md`](./LMWARES-PAYMENTS-HANDOFF-2026-07-29.md) | Separación de apps y credenciales de Mercado Pago |
| [`MERCADO-PAGO-SUBSCRIPTIONS-SANDBOX-POSTMORTEM-2026-07-30.md`](./MERCADO-PAGO-SUBSCRIPTIONS-SANDBOX-POSTMORTEM-2026-07-30.md) | Causas reales del atasco de sandbox y pairing Seller/Buyer |
| [`LMWARES-SUBSCRIPTIONS-TECHNICAL-RUNBOOK.md`](./LMWARES-SUBSCRIPTIONS-TECHNICAL-RUNBOOK.md) | Reproducción y criterio de salida de la suscripción técnica |
| [`LMWARES-AGENT-RUNNER.md`](./LMWARES-AGENT-RUNNER.md) | Ejecutor de agentes, worktrees y evidencia |
| [`LMWARES-LOCAL-RUNNER.md`](./LMWARES-LOCAL-RUNNER.md) | Runner local anterior y controles |
| [`LMWARES-REGISTRY.md`](./LMWARES-REGISTRY.md) | Registro privado de proyectos |
| [`LMWARES-AGENTIC-UI-DESIGN-PRACTICES.md`](./LMWARES-AGENTIC-UI-DESIGN-PRACTICES.md) | Diseño image-first, previews y QA visual |

### Infraestructura y seguridad

| Documento | Uso |
| --- | --- |
| [`env.md`](./env.md) | Nombres y ubicación correcta de variables/secretos, sin valores |
| [`deploy-cloudflare.md`](./deploy-cloudflare.md) | Despliegue Cloudflare completo |
| [`launch-checklist.md`](./launch-checklist.md) | Gate de staging/lanzamiento |
| [`security-checklist.md`](./security-checklist.md) | Access, Turnstile, secretos, CORS y trazabilidad |
| [`adversarial-playbook.md`](./adversarial-playbook.md) | Pruebas hostiles antes de producción |

### Advertencias de lectura

- `README.md` sigue describiendo la plantilla madre, no sustituye los runbooks LMWares.
- El handoff de módulos contiene historia acumulada y secciones antiguas que ya fueron
  superadas. Priorizar las actualizaciones superiores y la evidencia más reciente.
- El handoff de pagos de julio describe el sandbox técnico; no es autorización para
  cobros comerciales de producción.
- La visión contiene decisiones todavía pendientes; no convertirlas en comportamiento
  definitivo sin aprobación del usuario.

## 11. Secretos que deben existir, sin revelar valores

Public API, según el flujo usado:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `TURNSTILE_SECRET_KEY`
- `FREE_RUNNER_TOKEN`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN`
- `MERCADO_PAGO_SUBSCRIPTIONS_TEST_PAYER_EMAIL`
- secretos Webhook técnicos de prueba/producción;
- `MERCADO_PAGO_COMMERCIAL_ACCESS_TOKEN`
- `MERCADO_PAGO_COMMERCIAL_WEBHOOK_SECRET`
- `MERCADO_PAGO_MAINTENANCE_ACCESS_TOKEN`
- `MERCADO_PAGO_MAINTENANCE_WEBHOOK_SECRET`
- email binding y remitente/reply-to.

Admin API:

- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`
- `ACCESS_DISABLED = "0"` en producción.

Reglas:

- ningún secreto debe ir en `VITE_*`;
- no copiar tokens entre aplicaciones Mercado Pago;
- Checkout Pro comercial, sandbox técnico y mantenimiento son scopes separados;
- no imprimir secretos para “diagnosticar”;
- verificar presencia mediante Wrangler/preflight, no mediante lectura en chat.

## 12. Definición de una transición exitosa

La transición puede considerarse segura cuando el siguiente agente:

- confirma el estado Git sin perder el bloque local;
- crea un respaldo/commit revisable;
- reproduce typecheck, tests y build;
- resuelve la validación D1 que quedó colgada;
- alinea Public Web, Public API, Admin API y Admin Web en producción;
- completa una venta real de pago único sin crear suscripción;
- entrega MG Seguros en subdominio con comprobante y email correctos;
- conserva mantenimiento cerrado hasta una prueba deliberada;
- mantiene Carrito, Optimization y Marketing como próximos;
- no mezcla Oracle, ShynoLaser y AstraMuses como si fueran un solo repositorio.

Éste es el punto correcto para continuar. El sistema ya no está en fase de prototipo
vacío: Free funciona, el núcleo Starter está construido, el pago comercial fue probado
de forma controlada y el camino de pago único está implementado localmente. El riesgo
principal no es falta de código, sino consolidar y desplegar de manera coherente el
bloque final antes de cobrar al primer cliente real.
