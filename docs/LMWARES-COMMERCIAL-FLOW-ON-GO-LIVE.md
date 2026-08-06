# Flujo comercial LMWares: mantenimiento al publicar

Decisión vigente: **el mantenimiento es opcional**. Cuando se contrata, la
mensualidad comienza al publicar el proyecto, no durante la construcción. Una
oferta con MXN $0/mes es una implementación de pago único y no genera renovación.

## Fase 0: evaluación sin costo (antes de la Fase 1)

"Tomar revisión" en Paquetes (pasar un intake de `submitted` a `scope_review`)
es la **Fase 0**: una evaluación interna sin costo para el cliente. En esta
fase todavía no se cobra nada, no se crea ninguna orden de trabajo y no se
arranca ningún proyecto real. Fase 1 (25% pagado) sólo empieza después de que
el cliente acepta la oferta emitida en esta fase y paga el primer tramo.

Desde la migración de brief, el intake ya trae, además de plan/módulos:
`contact_name`, `contact_phone`, `business_name`, `business_summary`,
`site_goal` (obligatorios) y `style_preference`, `reference_notes`,
`custom_domain_preference`, `maintenance_plan_preference` (`later` por
defecto, o `none`/`basic`/`advanced`) y `maintenance_security_add_on`
(opcionales). Los últimos tres son **preferencias informativas** capturadas
en el propio armador de paquetes junto a los módulos Pro — orientan al
operador al redactar la oferta, pero **no fijan el precio contractual**:
ese sigue emitiéndose manualmente en la oferta, igual que hoy. Es el mínimo
para poder evaluar y, si se aprueba, redactar una oferta y arrancar el
proyecto con contexto real. El contenido fino de catálogo/galería (ej.
pólizas, clasificador de un seguro) se sigue
recabando en un segundo contacto con el cliente, ya con el proyecto aceptado
— el brief no reemplaza esa conversación, sólo evita arrancar a ciegas.

## Secuencia autorizada

1. El cliente inicia sesión y arma Starter o Pro.
2. El configurador envía una solicitud comercial. No abre Mercado Pago ni crea un cobro.
   La bandeja operativa es **Paquetes** (`/commercial-intakes`), no **Solicitudes**
   (Free/contacto). El resumen del configurador no cuenta como envío hasta que el
   botón confirme una solicitud abierta (`submitted` / `scope_review` / `offer_ready`).
   Reutilizar la clave de idempotencia de una solicitud ya `declined` o `converted`
   debe fallar y forzar un envío nuevo; no puede reaparecer como “enviada”.
3. Oracle revisa alcance, módulos, brief y viabilidad con participación humana
   (Fase 0, sin costo). El panel muestra un contador de paquetes `submitted`
   en la navegación de Paquetes.
4. LMWares prepara una oferta final; la estimación pública no constituye todavía el precio contractual.
5. El cliente acepta la oferta. Se crean de inmediato 4 órdenes de pago de
   implementación (25% cada una, ver sección de fases) y paga la primera para
   iniciar el proyecto; las siguientes pueden pagarse en orden o adelantarse,
   nunca es obligatorio adelantarlas.
6. El pago confirmado de la fase 1 crea una orden de trabajo Starter en
   `awaiting_provisioning`, con el brief ya incluido en su `work_snapshot`.
   El operador enlaza manualmente un proyecto real ya sincronizado en Oracle;
   no se inventa un repositorio ni se publica nada.
7. El proyecto avanza de `in_build` a `client_review` (exige la fase 2 pagada)
   y después a `ready_to_publish` (exige la fase 3 pagada), mientras se
   construye y valida en un subdominio `*.lmwares.com`.
8. Al llegar a la compuerta de publicación, se exige la fase 4 pagada y, si
   la oferta incluye mantenimiento, el cliente elige/activa su plan de
   mantenimiento (ya no se presenta como una "autorización" obligatoria: el
   mantenimiento es opcional y el cliente puede conservar la versión
   entregada sin contratarlo). Si la oferta fija MXN $0/mes, este segundo
   paso no existe.
9. LMWares publica después de comprobar la suscripción activa sólo cuando el
   importe mensual es mayor que cero. Las ofertas de pago único se publican sin suscripción.
10. Starter y Pro pueden migrar después a dominio personalizado.

## Reglas del sistema

- La selección original del cliente se conserva como registro inmutable.
- Los importes se recalculan en el servidor; nunca se confía en un precio enviado por el navegador.
- Los reintentos usan una clave idempotente para no duplicar solicitudes.
- La revisión humana puede tomar la solicitud o rechazarla con notas.
- Cada oferta final se conserva como una versión inmutable; emitir una revisión
  reemplaza la versión visible sin borrar el historial anterior.
- El cliente debe revisar alcance, importes y términos y aceptar explícitamente
  la versión vigente desde su centro de cuenta.
- La aceptación es idempotente, queda auditada una sola vez y crea una orden
  interna congelada; el cobro sólo se crea cuando el cliente pulsa continuar.
- La orden toma el importe de la oferta aceptada en D1. El navegador nunca
  envía ni puede sustituir el total.
- Checkout Pro comercial usa una referencia `lmw-implementation:<orderId>`,
  una clave de idempotencia estable y su propio Access Token y firma Webhook.
- La conciliación exige coincidencia exacta de referencia, moneda e importe.
  El primer pago aprobado queda canónico y un segundo aprobado bloquea la orden
  para revisión.
- Al confirmarse el pago, la solicitud cambia a `converted` y se crea una sola
  notificación interna aunque Mercado Pago reintente el evento.
- Ese mismo evento crea idempotentemente una orden operacional. Sólo un
  administrador puede enlazarla a un proyecto existente de Oracle y moverla
  por construcción, revisión del cliente y lista para publicar.
- `ready_to_publish` no es `live`: cuando la oferta tiene mensualidad, el panel
  exige que Mercado Pago la confirme como `active`; cuando la oferta aceptada
  tiene MXN $0/mes, permite publicar sin crear una suscripción.
- La mensualidad comercial vive en `lmw_maintenance_subscriptions`; no se
  mezcla con `lmw_subscriptions`, que conserva únicamente el ensayo técnico.
- El importe mensual se copia de la oferta aceptada y sólo puede reservarse
  para una implementación pagada, sin revisión de pago, con un proyecto real
  enlazado y en `ready_to_publish`.
- La primera publicación exige una URL HTTPS bajo `*.lmwares.com`. El panel
  vuelve idempotente la confirmación, registra auditoría y crea un único
  comprobante de publicación visible en la cuenta y entregable por email.
- Una cancelación concurrente posterior a `live` no puede hacer desaparecer el
  comprobante: el outbox puede reconstruirlo idempotentemente desde la orden
  publicada y la mensualidad congelada, aunque ésta ya figure cancelada.
- El comprobante Starter incluye URL, fecha, cuenta e IDs de solicitud, oferta,
  pago, orden y proyecto. Incluye importe e ID de suscripción sólo si se contrató
  mantenimiento; para pago único declara explícitamente que no hay renovaciones.
  El outbox reutiliza los leases y reintentos del canal transaccional ya validado por Free.
- Los checkouts técnicos de sandbox permanecen cerrados en producción mediante una puerta independiente.
- La reconciliación del ensayo existente sigue activa para observar sus cobros programados.

## Pago de implementación en 4 fases

Desde la migración `0027_lmwares_billing_order_phases.sql`, cada oferta
aceptada crea hasta 4 filas en `lmw_billing_orders` (`purpose = 'implementation'`,
`phase` 1 a 4) en vez de una sola orden por el 100%. El importe total de la
oferta se divide en 25% por fase (`splitImplementationIntoPhases`, la última
fase absorbe el residuo del redondeo). Las 4 fases se mapean 1:1 con las
transiciones del estado de la orden de trabajo Starter:

| Fase | % | Transición que habilita |
| --- | --- | --- |
| 1 | 25% | Crea la orden de trabajo (`awaiting_provisioning`) |
| 2 | 25% | `in_build` → `client_review` |
| 3 | 25% | `client_review` → `ready_to_publish` |
| 4 | 25% | `ready_to_publish` → `live` (publicación) |

Reglas de negocio:

- Las 4 órdenes se crean de golpe al aceptar la oferta; el cliente puede
  pagarlas en orden o adelantar una fase posterior, nunca es obligatorio.
- Cada compuerta de transición sólo exige que la fase correspondiente esté
  `paid`; si esa fila no existe (órdenes de pago único históricas, previas a
  esta migración) la compuerta se considera superada, preservando
  compatibilidad hacia atrás sin necesidad de reescribir datos existentes.
- Confirmar el pago de una fase nunca cancela ni marca en revisión a sus
  fases hermanas de la misma oferta; la lógica de "pago duplicado" y
  cancelación de órdenes obsoletas en `reconcilePayment()` sólo actúa sobre
  órdenes de una versión de oferta *distinta* (revisiones supersedidas).
- Reabrir una oferta expirada (`cancelExpiredImplementationAndReopen`) exige
  que ninguna fase 2-4 tenga ya un pago o revisión pendiente; de lo contrario
  requiere intervención manual porque hay dinero real comprometido.
- Las fases ya pagadas no son reembolsables por defecto; un reembolso sólo
  procede por decisión manual del operador si el proyecto se cancela a medio camino.

## Compuerta productiva del pago de implementación

Antes de habilitar una compuerta se ejecuta el preflight de sólo lectura. No
lee ni imprime valores secretos:

```powershell
pwsh -NoProfile -File scripts/lmwares-commercial-preflight.ps1 -RequireReady All
```

El comando termina con código `2` si faltan credenciales, migraciones, salud de
la API o integridad referencial. `-RequireReady Report` permite revisar el
estado general aunque todavía no se hayan cargado los secretos.

- La implementación está habilitada para la prueba productiva controlada con
  `MERCADO_PAGO_COMMERCIAL_PAYMENTS_ENABLED = "1"`. La mensualidad permanece
  en `"0"` y ninguna orden cobra hasta que el cliente abre y confirma su
  Checkout Pro.
- Antes de abrirla se cargan como secretos, sin comillas y sin registrarlos en
  el repositorio:
  - `MERCADO_PAGO_COMMERCIAL_ACCESS_TOKEN`
  - `MERCADO_PAGO_COMMERCIAL_WEBHOOK_SECRET`
- El Webhook comercial canónico es
  `https://api.lmwares.com/payments/webhooks/mercado-pago?scope=commercial`.
- La primera apertura requiere un cobro real controlado de MXN $1 mediante una
  oferta privada, comprobar `paid` en D1, la solicitud `converted`, el evento
  Webhook `processed` y luego reembolsar desde Mercado Pago si corresponde.
- Sólo después de esa evidencia se mantiene la puerta en `"1"` para clientes.

## Lo que falta después de esta fase

- cargar las credenciales comerciales y validar el cobro real controlado;
- pruebas comerciales controladas de punta a punta.

## Compuerta productiva de la mensualidad

- La autorización permanece desplegable y cerrada con
  `MERCADO_PAGO_MAINTENANCE_SUBSCRIPTIONS_ENABLED = "0"`.
- Usa una integración y canal separados del sandbox técnico:
  - `MERCADO_PAGO_MAINTENANCE_ACCESS_TOKEN`
  - `MERCADO_PAGO_MAINTENANCE_WEBHOOK_SECRET`
- El Webhook canónico de Planes y suscripciones es
  `https://api.lmwares.com/payments/webhooks/mercado-pago?scope=maintenance`.
- Webhook y cron consultan nuevamente Mercado Pago, exigen coincidencia exacta
  de referencia, importe, moneda y frecuencia, y guardan cada cargo por su ID
  autorizado único.
- Cerrar la compuerta impide contratos nuevos, pero no detiene Webhooks, cron,
  conciliación ni cancelación de contratos existentes. Los eventos mensuales
  usan su propio espacio de idempotencia y sus credenciales exclusivas.
- `canceled` y `disputed` son estados terminales en D1: una respuesta
  concurrente u obsoleta no puede reabrirlos como `active`.
- Sólo una mensualidad activa permite cambiar la orden de
  `ready_to_publish` a `live`; ninguna respuesta del navegador puede saltarse
  esa verificación en D1.
- El regreso de Mercado Pago a `/suscripcion/<workOrderId>` concilia
  automáticamente el estado cuando incluye `preapproval_id`, pero la interfaz
  distingue explícitamente `active` de `live`: autorizar abre la compuerta y
  la publicación sigue siendo una acción operacional separada.
- El centro de cuenta conserva el acceso a administrar la mensualidad después
  de publicar y muestra acciones específicas para estados pendientes, en
  atención, pausados, disputados o cancelados.

La política de datos puede comprobarse sin secretos ni llamadas al proveedor:

```powershell
npm run lmwares:maintenance:validate
```

El validador crea una base D1 local aislada, aplica todas las migraciones y
comprueba con datos sintéticos que se bloquean órdenes sin proyecto, sin pago,
con revisión pendiente, con oferta reemplazada o todavía en construcción.
También verifica la reserva idempotente de una sola mensualidad, la transición
a `live` únicamente con suscripción `active` y la conciliación idempotente de
un cargo autorizado. El almacenamiento temporal se elimina al terminar.

### Evidencia comercial acumulada: 2026-08-03

El preflight y consultas agregadas de sólo lectura sobre D1 remoto confirmaron:

- tres órdenes de implementación: una `paid` por MXN $10, una `canceled` por
  MXN $1 y una `payment_pending` por MXN $10;
- un intento de pago `accepted` y uno `pending`;
- seis Webhooks comerciales `processed` y ninguno fallido vinculado a estas
  órdenes;
- una orden operacional en `in_build`, vinculada a `shynolaser.mx`;
- ambas parejas de secretos comerciales y de mantenimiento presentes;
- pago comercial habilitado, mensualidad todavía deshabilitada;
- cero suscripciones de mantenimiento y cero órdenes actualmente elegibles
  para crearlas.

`lmwares-commercial-preflight.ps1` informa ahora las órdenes de implementación
pagadas y exige al menos una orden elegible cuando se ejecuta con
`-RequireReady Maintenance` o `-RequireReady All`. Una orden sólo es elegible
si está en `ready_to_publish`, tiene proyecto enlazado, pago canónico sin
revisión y oferta aceptada. Así el preflight no puede declarar lista la
mensualidad mientras ShynoLaser continúe legítimamente en construcción.

La regresión local de la política de mantenimiento pasó el mismo día sobre una
base D1 aislada. Durante esa prueba no se abrió la compuerta remota, no se
leyeron secretos y no se realizó ninguna solicitud a Mercado Pago.

## Validación técnica de la oferta

- La primera oferta queda `superseded` al emitir una segunda versión.
- Sólo una versión puede permanecer `issued` por solicitud.
- Cada versión genera una notificación independiente dentro de la cuenta.
- Aceptar dos veces devuelve la misma aceptación y crea un solo evento de
  auditoría.
- La oferta no expone identificadores internos del operador y sólo puede ser
  consultada o aceptada por el usuario propietario de la solicitud.
