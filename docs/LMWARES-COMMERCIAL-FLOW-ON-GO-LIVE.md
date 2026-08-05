# Flujo comercial LMWares: mantenimiento al publicar

Decisión vigente: **el mantenimiento es opcional**. Cuando se contrata, la
mensualidad comienza al publicar el proyecto, no durante la construcción. Una
oferta con MXN $0/mes es una implementación de pago único y no genera renovación.

## Secuencia autorizada

1. El cliente inicia sesión y arma Starter o Pro.
2. El configurador envía una solicitud comercial. No abre Mercado Pago ni crea un cobro.
3. Oracle revisa alcance, módulos y viabilidad con participación humana.
4. LMWares prepara una oferta final; la estimación pública no constituye todavía el precio contractual.
5. El cliente acepta y paga la implementación.
6. El pago confirmado crea una orden de trabajo Starter en
   `awaiting_provisioning`. El operador enlaza manualmente un proyecto real ya
   sincronizado en Oracle; no se inventa un repositorio ni se publica nada.
7. El proyecto avanza de `in_build` a `client_review` y después a
   `ready_to_publish`, mientras se construye y valida en un subdominio
   `*.lmwares.com`.
8. Al llegar a la compuerta de publicación, si la oferta incluye mantenimiento,
   el cliente autoriza la mensualidad. Si la oferta fija MXN $0/mes, este paso no existe.
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
