# Flujo comercial LMWares: mantenimiento al publicar

Decisión vigente: **la mensualidad comienza al publicar el proyecto**, no durante la construcción.

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
8. Al llegar a la compuerta de publicación, el cliente autoriza la mensualidad.
9. LMWares comprueba la suscripción activa y publica. Desde ese momento empieza el mantenimiento mensual.
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
- `ready_to_publish` no es `live`: el panel no expone ninguna transición de
  publicación hasta que la compuerta de suscripción esté implementada.
- Los checkouts técnicos de sandbox permanecen cerrados en producción mediante una puerta independiente.
- La reconciliación del ensayo existente sigue activa para observar sus cobros programados.

## Compuerta productiva del pago de implementación

- La implementación está desplegable con
  `MERCADO_PAGO_COMMERCIAL_PAYMENTS_ENABLED = "0"`; así no puede cobrar por
  accidente.
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
- compuerta de publicación que exija una suscripción activa;
- pruebas comerciales controladas de punta a punta.

## Validación técnica de la oferta

- La primera oferta queda `superseded` al emitir una segunda versión.
- Sólo una versión puede permanecer `issued` por solicitud.
- Cada versión genera una notificación independiente dentro de la cuenta.
- Aceptar dos veces devuelve la misma aceptación y crea un solo evento de
  auditoría.
- La oferta no expone identificadores internos del operador y sólo puede ser
  consultada o aceptada por el usuario propietario de la solicitud.
