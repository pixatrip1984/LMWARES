# Mercado Pago Suscripciones en sandbox: postmortem de una integración difícil

Fecha: 2026-07-30

Proyecto de origen: LMWares

Alcance: México, API de Suscripciones, cuentas de prueba, Webhooks y Cloudflare Workers

## Propósito

Este documento registra qué salió mal, por qué los mensajes de error nos llevaron por
caminos incompletos y cuál fue la configuración que finalmente funcionó. Está pensado
primero como memoria técnica para LMWares y, después de revisar las referencias al
proyecto, como material compartible con otros desarrolladores.

No contiene Access Tokens, claves Webhook, contraseñas, correos de usuarios de prueba
ni valores de firmas. Los identificadores de aplicaciones y recursos fueron omitidos
deliberadamente.

> Importante: la inconsistencia del simulador de Webhooks descrita aquí fue observada
> el 30 de julio de 2026 en una aplicación mexicana de Suscripciones. Es evidencia de
> un caso concreto, no una garantía sobre el comportamiento de todas las aplicaciones
> o países.

## Resumen ejecutivo

No estuvimos bloqueados por un solo error. Se superpusieron cinco problemas:

1. Checkout Pro y Suscripciones son productos y APIs diferentes.
2. Mercado Pago distingue estrictamente entre identidades reales y de prueba.
3. Una aplicación creada dentro de un Seller TEST debe usar las credenciales
   “productivas” de ese Seller TEST, aunque todo el dinero siga siendo ficticio.
4. Las sesiones del navegador mezclaron cuentas reales, Seller TEST y Buyer TEST.
5. El simulador de Webhooks generó una solicitud internamente contradictoria: el
   cuerpo describía un `subscription_preapproval`, mientras la URL indicaba
   `subscription_authorized_payment` y otro `data.id`.

El modelo que funcionó fue:

```text
Cuenta real que administra las pruebas
└── crea dos usuarios de prueba del mismo país
    ├── Seller TEST
    │   └── posee una aplicación específica de Suscripciones
    │       ├── Access Token de esa aplicación
    │       └── clave Webhook de esa aplicación y ambiente
    └── Buyer TEST
        └── autoriza la suscripción con su identidad y saldo de prueba

Cuenta Google del cliente en LMWares
└── conserva la propiedad interna de la propuesta
    └── no sustituye al Buyer TEST dentro de Mercado Pago
```

La lección principal es sencilla: en sandbox no basta con tener “una credencial de
prueba”. El vendedor, la aplicación, el Access Token, el comprador y la clave Webhook
deben pertenecer al mismo universo de prueba.

## Qué intentábamos validar

El flujo técnico de LMWares tenía dos compuertas independientes:

1. Un pago único de prueba mediante Checkout Pro.
2. Una autorización de cobro mensual mediante la API de Suscripciones.

Para Suscripciones usamos un `preapproval` sin plan asociado:

- creación mediante `POST /preapproval`;
- estado inicial `pending`;
- autorización posterior en el checkout de Mercado Pago;
- reconciliación del estado desde la API del proveedor;
- Webhooks para cambios de la suscripción y futuros cobros programados.

El precio de MXN 10 mensuales fue únicamente una prueba técnica. No representa el
precio comercial de LMWares.

## Lo que la documentación oficial sí deja claro

Mercado Pago documenta que:

- las cuentas Buyer TEST y Seller TEST deben ser cuentas distintas y del mismo país;
- las aplicaciones de cuentas de prueba operan con las credenciales correspondientes
  a esa aplicación;
- desde junio de 2024 se reforzó el uso de credenciales de producción cuando se
  trabaja dentro de aplicaciones pertenecientes a cuentas de prueba;
- una suscripción puede crearse directamente con `POST /preapproval`, sin plan;
- `subscription_preapproval` representa la vinculación o actualización de una
  suscripción;
- `subscription_authorized_payment` representa un cobro recurrente o factura
  autorizada;
- un Webhook moderno incluye `x-signature` y `x-request-id`;
- la verificación documentada reconstruye la firma con `data.id` de la URL;
- el receptor debe devolver HTTP 200 o 201 cuando acepta una notificación.

Fuentes oficiales:

- [Cuentas de prueba](https://www.mercadopago.com.mx/developers/es/docs/links-and-debts/additional-content/your-integrations/test/accounts)
- [Mejoras de 2024 al flujo de pruebas](https://www.mercadopago.com.mx/developers/es/news/2024/06/26/Improvements-in-the-integration-testing-flow)
- [Resumen de Suscripciones](https://www.mercadopago.com.mx/developers/es/docs/subscriptions/overview)
- [Crear una suscripción](https://www.mercadopago.com.mx/developers/es/reference/online-payments/subscriptions/create-preapproval/post)
- [Probar una compra de Suscripciones](https://www.mercadopago.com.mx/developers/es/docs/subscriptions/integration-test/payment-approval)
- [Webhooks y validación de firma](https://www.mercadopago.com.mx/developers/es/docs/your-integrations/notifications/webhooks)

## Por qué nos atoramos

### 1. Confundimos “credencial de prueba” con “credencial correcta”

Probamos diferentes tokens porque los mensajes del proveedor eran genéricos. Un token
con prefijo `TEST-` podía consultar algunos endpoints, pero la creación del
`preapproval` terminaba en un error interno del proveedor:

```text
SEARCH_STATUS=200
CREATE_STATUS=500
CREATE_ERROR=Internal server error
```

Agregar encabezados o scopes no documentados no lo arregló; incluso produjo respuestas
403. El problema no era el prefijo por sí solo, sino la propiedad de la aplicación y
la identidad del vendedor.

La combinación exitosa fue:

- iniciar sesión con el Seller TEST;
- crear allí una aplicación destinada a Suscripciones;
- utilizar el Access Token “productivo” de esa aplicación Seller TEST;
- enviar como pagador el correo generado del Buyer TEST emparejado.

Que el token comenzara con `APP_USR-` no significaba que fuera a mover dinero real.
El propietario de la aplicación seguía siendo un usuario de prueba.

### 2. Mezclamos personas que cumplen funciones distintas

Durante la integración coexistían cuatro identidades:

| Identidad | Función | No debe confundirse con |
| --- | --- | --- |
| Cuenta real administradora | Crea y gestiona usuarios de prueba | Seller TEST |
| Seller TEST | Posee la aplicación y cobra dinero ficticio | Cuenta real productiva |
| Buyer TEST | Autoriza y paga en sandbox | Usuario Google de LMWares |
| Usuario Google | Es dueño de la propuesta dentro de LMWares | Pagador de Mercado Pago |

Cuando el colector era real y el pagador era de prueba, o viceversa, Mercado Pago
devolvía mensajes como:

```text
Both payer and collector must be real or test users
```

El error describía la condición, pero no señalaba cuál credencial pertenecía al lado
incorrecto.

### 3. Tomamos valores ilustrativos como si fueran identidades universales

La referencia de `POST /preapproval` muestra un correo ilustrativo. Ese valor sirve
para explicar el campo `payer_email`, pero no debe asumirse que sustituye el correo
generado del Buyer TEST que participa en una prueba con cuentas.

Para nuestro flujo, el correo correcto fue el asociado al Buyer TEST real de la prueba.
Nunca debe quedar hardcodeado en el repositorio, en el navegador ni en un comando
guardado en el historial.

### 4. Las cookies parecían ser la causa principal

Vimos síntomas como:

- demasiadas redirecciones;
- checkout sin selector de usuario;
- una sesión real apareciendo en un checkout de prueba;
- “Una de las partes con la que intentas hacer el pago es de prueba”;
- “No pudimos procesar tu pago”;
- rechazo de tarjetas físicas o digitales reales.

Limpiar cookies o usar una ventana privada era necesario para aislar sesiones, pero no
arreglaba una aplicación o token incorrectos. Las cookies amplificaban el problema;
no eran la raíz de todos los errores.

El recorrido estable fue:

1. cerrar cualquier sesión real de Mercado Pago;
2. abrir un contexto de navegador limpio;
3. iniciar sesión como Buyer TEST;
4. usar el medio de pago o saldo de prueba;
5. no abrir el checkout con la cuenta Seller TEST;
6. volver a LMWares para conciliar el estado desde el servidor.

### 5. El sandbox no siempre daba diagnósticos accionables

Encontramos respuestas 500 con mensajes genéricos aunque la forma del request fuera
válida. Por eso fue necesario separar la prueba en dos operaciones:

1. buscar por `external_reference`;
2. crear sólo si no existía ya un recurso.

El script de diagnóstico debía imprimir únicamente:

- tipo de token;
- estado HTTP;
- número de coincidencias;
- resultado sanitizado del proveedor;
- estado del `preapproval`.

Nunca debía imprimir el Access Token ni el correo del Buyer TEST.

## La anomalía final del simulador de Webhooks

### Comportamiento esperado según la documentación

Para validar una firma, el ejemplo oficial utiliza:

- `x-signature`;
- `x-request-id`;
- el parámetro `data.id` de la URL;
- la clave secreta de la aplicación.

Después, el tópico decide qué recurso consultar:

| Tópico | Recurso |
| --- | --- |
| `subscription_preapproval` | Suscripción o `preapproval` |
| `subscription_authorized_payment` | Factura o cobro autorizado |

### Lo que observamos

El panel mostró al usuario un cuerpo equivalente a:

```json
{
  "action": "updated",
  "data": {
    "id": "<preapproval-id>"
  },
  "entity": "preapproval",
  "type": "subscription_preapproval"
}
```

Sin embargo, el registro HTTP del Worker mostró que la URL realmente recibida tenía:

```text
type=subscription_authorized_payment
data.id=<marcador-alfanumérico-del-simulador>
```

Los encabezados sí estaban presentes:

- `x-request-id`: presente y con formato razonable;
- `x-signature`: presente;
- `ts`: 10 dígitos;
- `v1`: 64 caracteres hexadecimales.

El primer diagnóstico fue “la clave secreta no coincide”. Esa conclusión era
incompleta.

### Cómo aislamos la causa

Conservamos una solicitud capturada sin imprimir sus encabezados y repetimos la
verificación de forma controlada:

1. firma + `data.id` de la URL: HTTP 401;
2. misma firma + `data.id` del cuerpo: HTTP 200;
3. solicitud original completa después de la corrección: HTTP 200.

Esto demostró que, en esta ejecución del simulador, la firma se había construido con
el ID del cuerpo y no con el marcador que aparecía en la URL.

### La corrección segura

No cambiamos la validación general de Webhooks. Se añadió una ruta de compatibilidad
con estas condiciones simultáneas:

1. `MERCADO_PAGO_TEST_MODE=1`;
2. la URL anuncia `subscription_authorized_payment`;
3. su ID no tiene el formato numérico de un cobro real;
4. el cuerpo describe `subscription_preapproval`;
5. el cuerpo identifica la entidad `preapproval`;
6. la HMAC valida usando el ID del cuerpo;
7. la solicitud se reconoce sólo como prueba de conectividad;
8. no se consulta ni persiste como un cobro.

Si cualquiera de esas condiciones falla, el receptor conserva el rechazo 401.

En producción:

- no existe esta excepción;
- no se confía en el cuerpo por sí solo;
- la HMAC es obligatoria;
- el recurso se consulta a Mercado Pago antes de cambiar el estado interno;
- la idempotencia evita procesar dos veces el mismo evento.

### Qué no debe hacerse

No se debe:

- responder 200 a todos los Webhooks sólo para satisfacer el simulador;
- desactivar la HMAC;
- aceptar un `data.id` del cuerpo sin validar una firma;
- usar el fallback de sandbox en producción;
- registrar `x-signature`, Access Tokens o claves secretas en logs;
- tratar un probe del simulador como evidencia de un cargo real.

## Otro factor de confusión: despliegues de Cloudflare

Wrangler logró subir nuevas versiones del Worker, pero después falló al consultar o
actualizar las rutas por falta de permisos del token:

```text
Authentication error [code: 10000]
```

El comando terminó con código de salida 1, lo que parecía indicar que nada se había
desplegado. Sin embargo:

- la carga del Worker había concluido;
- `wrangler deployments status` mostraba la nueva versión activa al 100%;
- `https://api.lmwares.com/health` devolvía HTTP 200;
- la ruta existente seguía apuntando al Worker.

La lección es no interpretar el código de salida de un despliegue compuesto sin leer
en qué etapa falló. La solución definitiva sigue siendo otorgar al token de Cloudflare
los permisos necesarios para administrar Workers Routes; verificar la versión activa
es sólo una comprobación, no un sustituto de corregir permisos.

## Matriz de errores y causas

| Síntoma | Primera hipótesis | Causa o explicación confirmada |
| --- | --- | --- |
| Tarjeta real rechazada en sandbox | Banco no compatible | Se mezclaba una tarjeta real con un entorno de prueba |
| “Una de las partes… es de prueba” | Cookies | Colector y pagador pertenecían a universos distintos |
| `ERR_TOO_MANY_REDIRECTS` | Checkout roto | Sesiones incompatibles acumuladas; síntoma secundario |
| `CREATE_STATUS=500` | JSON incorrecto | Token y aplicación no pertenecían al Seller TEST adecuado |
| `Both payer and collector...` | Correo mal escrito | Mezcla explícita entre identidad real y de prueba |
| Suscripción creada pero sin cargo | Webhook perdido | La autorización programó el primer cobro para una fecha futura |
| Webhook 401 con headers presentes | Clave mal copiada | El simulador firmó un ID diferente al `data.id` de la URL |
| Wrangler terminó en error | Worker no desplegado | El upload terminó; falló después la gestión de rutas |

## Procedimiento recomendado desde cero

### A. Modelar las identidades

1. Crear Seller TEST y Buyer TEST del mismo país.
2. Registrar sus User IDs y roles, sin copiar contraseñas a documentación.
3. Decidir qué cuenta es dueña de cada aplicación.
4. No usar al usuario Google de la aplicación como sustituto del Buyer TEST.

### B. Crear la aplicación de Suscripciones

1. Iniciar sesión como Seller TEST.
2. Crear una aplicación específica para Suscripciones.
3. Obtener el Access Token perteneciente a esa aplicación.
4. Guardarlo únicamente como secreto server-side.
5. Guardar por separado el correo generado del Buyer TEST.

No seleccionar una credencial sólo por su prefijo. Hay que verificar propietario,
producto y ambiente.

### C. Diagnosticar la API antes de abrir el navegador

1. Ejecutar `GET /preapproval/search` por `external_reference`.
2. Si no existe, ejecutar una sola creación.
3. Usar una clave de idempotencia o una referencia interna estable.
4. Registrar sólo estados sanitizados.
5. Confirmar que el resultado sea `pending` y que exista un `init_point`.

### D. Autorizar con el Buyer TEST

1. Abrir un contexto de navegador limpio.
2. Iniciar sesión como Buyer TEST.
3. Abrir el `init_point` devuelto por la API.
4. Autorizar con saldo o medio de pago de prueba compatible.
5. Volver al sitio.
6. Consultar `GET /preapproval/{id}` desde el backend.
7. Marcar la suscripción como activa sólo si el proveedor devuelve `authorized`.

### E. Configurar Webhooks

1. Abrir la misma aplicación de Suscripciones.
2. Ir a Webhooks y seleccionar el modo correcto.
3. Configurar una URL HTTPS pública.
4. Activar los tópicos necesarios.
5. Copiar la clave de ese ambiente a un secreto del backend.
6. Verificar `x-signature` y `x-request-id`.
7. Consultar el recurso oficial antes de mutar datos internos.
8. Responder 200 o 201 sólo después de aceptar o identificar idempotentemente el
   evento.

Si Checkout Pro y Suscripciones usan aplicaciones distintas, también deben usar
Access Tokens y claves Webhook distintas.

### F. Probar el simulador sin debilitar producción

1. Capturar metadata estructural, no valores secretos:
   - tópico;
   - presencia de `data.id`;
   - formato del ID;
   - presencia y longitudes de headers;
   - estado HTTP;
   - User-Agent.
2. Comparar URL y cuerpo.
3. Reproducir con una solicitud capturada sólo en un entorno controlado.
4. Si el simulador contradice el protocolo documentado, limitar cualquier
   compatibilidad a modo prueba y probes sin efectos.
5. Mantener el camino productivo estricto.

## Implementación de LMWares

Archivos principales:

- `workers/public-api/src/routes/payments.ts`
- `workers/public-api/src/lib/mercado-pago.ts`
- `workers/public-api/src/lib/mercado-pago.test.mjs`
- `scripts/diagnose-mercado-pago-subscription.ps1`
- `docs/LMWARES-SUBSCRIPTIONS-TECHNICAL-RUNBOOK.md`
- `docs/LMWARES-PAYMENTS-HANDOFF-2026-07-29.md`

Secretos separados:

- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `MERCADO_PAGO_WEBHOOK_TEST_SECRET`
- `MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN`
- `MERCADO_PAGO_SUBSCRIPTIONS_TEST_PAYER_EMAIL`
- `MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_SECRET`
- `MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_TEST_SECRET`

Ninguno de sus valores vive en Git.

Commit que cerró la compatibilidad segura con el simulador:

```text
80f61b3 handle Mercado Pago subscription webhook probes
```

Evidencia final:

```text
Webhook simulator: 200 OK
Worker health: 200 OK
Tests: 2/2
Typecheck: OK
Dry-run: OK
```

## Qué está validado y qué sigue abierto

### Validado

- separación entre Checkout Pro y Suscripciones;
- creación de una aplicación Seller TEST para Suscripciones;
- creación de un `preapproval` sin plan;
- autorización con Buyer TEST;
- estado `authorized` conciliado;
- próxima fecha mensual informada por Mercado Pago;
- persistencia interna como suscripción activa;
- simulador Webhook firmado aceptado con HTTP 200;
- excepción de simulador aislada de los cobros reales;
- idempotencia y consulta al proveedor en el camino normal.

### Todavía abierto

- recibir el primer `subscription_authorized_payment` real del ciclo programado;
- persistir el primer cargo recurrente real de prueba;
- validar reintentos y estados de atención de pago;
- probar cancelación tanto en Mercado Pago como en D1;
- confirmar con un `preapproval` nuevo que Mercado Pago acepta y utiliza el
  `notification_url` enviado durante la creación;
- corregir los permisos de Workers Routes del token de Cloudflare;
- definir precios, fechas y políticas comerciales;
- ejecutar una prueba productiva con dinero real y `MERCADO_PAGO_TEST_MODE=0`.

El Webhook 200 del simulador valida conectividad y autenticación del probe. No demuestra
que ya ocurrió un cobro recurrente.

## Conclusiones

La integración se volvió difícil porque cada capa funcionaba parcialmente:

- algunas credenciales permitían buscar, pero no crear;
- algunas sesiones permitían abrir el checkout, pero mezclaban identidades;
- la suscripción podía autorizarse, pero no generar todavía un cargo;
- el Worker recibía el Webhook, pero el simulador contradecía su propia URL;
- Cloudflare subía el código, pero el comando terminaba reportando otro fallo.

La salida no fue “probar tokens hasta que uno funcionara”. Fue construir una cadena de
evidencia:

1. identificar al propietario real de cada recurso;
2. separar búsqueda, creación, autorización y conciliación;
3. observar la solicitud HTTP recibida;
4. verificar la HMAC sin exponer secretos;
5. reproducir la anomalía de forma controlada;
6. limitar el workaround a un probe firmado y sin efectos;
7. comprobar versión desplegada, salud y pruebas.

Esa metodología es el resultado más reutilizable de todo el incidente.
