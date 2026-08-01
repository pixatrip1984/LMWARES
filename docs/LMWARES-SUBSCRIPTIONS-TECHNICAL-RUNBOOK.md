# LMWares: runbook técnico de suscripciones

Fecha: 2026-08-01

Este runbook valida cobros recurrentes sin convertir el monto de prueba en una tarifa
comercial. El flujo usa una suscripción sin plan asociado, individual por propuesta,
creada en Mercado Pago con estado `pending`.

## Alcance de la prueba

- Cobro único previo: Checkout Pro técnico de MXN $5.
- Suscripción: MXN $10 cada mes, mínimo aceptado por Mercado Pago en esta prueba.
- Moneda: MXN.
- Ambiente: credenciales de prueba con `MERCADO_PAGO_TEST_MODE=1`.
- Pagador API en sandbox: correo generado del Buyer TEST emparejado; se guarda como
  secreto y nunca se hardcodea. La cuenta Google sólo conserva la propiedad interna
  de la propuesta y no se mezcla con el vendedor de prueba.
- Requisito: propuesta `paid` y `payment_review_required=0`.
- No valida todavía precios reales, fecha contractual de inicio, gracia ni reembolsos.

Una propuesta bloqueada por pago duplicado no puede crear una suscripción. Para la
prueba E2E debe generarse una propuesta nueva y completar un solo pago aprobado.

## Recorrido del usuario

1. Iniciar sesión con Google en `https://contratar.lmwares.com`.
2. Crear un paquete Starter o Pro y continuar al pago técnico.
3. Completar un solo pago de prueba y pulsar `Ya pagué · verificar estado`.
4. Cuando la propuesta esté pagada, pulsar `Preparar suscripción mensual`.
5. Autorizar la recurrencia en la pestaña de Mercado Pago.
6. Volver a LMWares y pulsar `Ya autoricé · verificar estado`.
7. Confirmar estado `Activa` y una fecha de próximo cobro informada por Mercado Pago.
8. Al terminar la prueba, pulsar `Cancelar prueba` y confirmar estado `Cancelada`.

## Recursos internos

- `lmw_subscriptions`: estado del preapproval y próxima fecha programada.
- `lmw_subscription_charges`: cada `authorized_payment` de Mercado Pago.
- `lmw_payment_webhook_events`: libro idempotente compartido; la migración 0016 añade
  `subscription_id`.
- `audit_events`: creación, conciliación, cargos y cancelación.

Estados internos: `creating`, `creation_failed`, `pending_authorization`, `active`,
`payment_attention`, `paused`, `canceled` y `disputed`.

## Endpoints

- `GET /subscriptions/proposals/:proposalId`
- `POST /subscriptions/proposals/:proposalId`
- `POST /subscriptions/:id/reconcile`
- `POST /subscriptions/:id/cancel`
- `POST /payments/webhooks/mercado-pago`

Además, el Worker ejecuta una conciliación horaria (`17 * * * *`) sobre un lote
rotativo de suscripciones abiertas. Este respaldo consulta tanto el preapproval como
`/authorized_payments/search`, de modo que un Webhook perdido no oculte un cargo o
un cambio de estado. La conciliación preserva estados cancelados, pausados y en disputa
frente a eventos de factura tardíos.

En el sandbox mexicano, `/authorized_payments/search` aceptó el filtro exacto
`preapproval_id` pero rechazó los parámetros `limit` y `offset` con
`invalid value for limit`. La conciliación no debe reutilizar la paginación de otros
buscadores de Mercado Pago: consulta la página predeterminada y valida que cada resultado
pertenezca al preapproval, referencia, importe y moneda congelados.

Todas las acciones del usuario requieren sesión y origen confiable. El navegador no
recibe el Access Token ni las claves de Webhook.

## Webhooks de Mercado Pago

Callback de prueba y producción durante esta validación:

`https://api.lmwares.com/payments/webhooks/mercado-pago`

Tópicos necesarios:

- `payment`
- `subscription_preapproval`
- `subscription_authorized_payment`

El receptor verifica HMAC. El fallback sandbox sólo se permite con modo de prueba,
encabezado de firma bien formado y consulta satisfactoria del recurso a Mercado Pago.
Producción no admite ese fallback.

## Criterio de salida

La compuerta se considera validada cuando existe evidencia de:

- preapproval creado una sola vez para la referencia interna;
- autorización y próxima fecha de cobro conciliadas;
- Webhook de preapproval entregado con 200;
- al menos un cargo autorizado registrado, si Mercado Pago lo genera durante la prueba;
- repetición idempotente del mismo Webhook;
- cancelación confirmada tanto por Mercado Pago como por D1.

Si el sandbox no genera el primer cargo inmediatamente, la infraestructura recurrente
puede validarse hasta `next_payment_date`, pero el paso de cargo programado permanece
abierto hasta recibir `subscription_authorized_payment`; no debe marcarse como aprobado
por inferencia.

## Evidencia técnica vigente

Validación del 2026-08-01 sobre la suscripción de prueba
`1e4f6134-cb95-49c3-9c86-d9ce56250efa`:

- preapproval `fc517a265b4a4af0910ff83b63af9c5b` en estado `authorized`;
- próxima fecha informada: `2026-08-30T04:49:00.000-04:00`;
- authorized payment `7030434341`, pago `170286433015`, MXN $10, estado de pago
  `approved`;
- el Webhook del cargo inicial no apareció en `lmw_payment_webhook_events`; la
  conciliación recuperó el cargo desde el proveedor;
- dos conciliaciones consecutivas conservaron exactamente una fila de cargo, probando
  idempotencia por `provider_authorized_payment_id`;
- la suscripción permaneció activa y sin `canceled_at`.

Esta evidencia cierra creación, autorización, recuperación e idempotencia. La prueba de
cancelación y el siguiente débito programado permanecen como compuertas explícitas; no se
canceló la suscripción durante esta validación para conservar la prueba del 30 de agosto.
