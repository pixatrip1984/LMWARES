# LMWares: runbook técnico de suscripciones

Fecha: 2026-07-29

Este runbook valida cobros recurrentes sin convertir el monto de prueba en una tarifa
comercial. El flujo usa una suscripción sin plan asociado, individual por propuesta,
creada en Mercado Pago con estado `pending`.

## Alcance de la prueba

- Cobro único previo: Checkout Pro técnico de MXN $5.
- Suscripción: MXN $5 cada mes.
- Moneda: MXN.
- Ambiente: credenciales de prueba con `MERCADO_PAGO_TEST_MODE=1`.
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
