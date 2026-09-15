# Plan de implementación: fase 0 gratuita, demo y seguimiento comercial

Fecha: 2026-09-09. Repositorio: `C:\dev\oracle`.
Estado: propuesta de implementación basada en inspección del código local. No se han implementado estos cambios ni verificado su estado en producción.

## 1. Resultado que debe recibir el cliente

Oracle envía una propuesta que incluye una **fase 0 gratuita para preparar una demo de la página pública**. La construcción empieza cuando el cliente acepta esa versión de la propuesta. En ese momento aparece su proyecto en «Mis sitios», con un enlace estable a su subdominio LMWares.

Primero verá una pantalla animada y amigable de preparación. Después, en la misma dirección, verá una demo real de su página pública. Cuando el operador marque la fase 0 como terminada en Oracle, se habilitará el primer pago. La fase 1 de implementación solo podrá comenzar cuando ese pago esté confirmado.

El subdominio seguirá mostrando la última versión disponible durante todo el desarrollo. El dominio personalizado se conectará en la fase final de despliegue e indexación.

La revisión inicial de una solicitud no es esta fase 0: es la evaluación comercial previa a enviar la propuesta. La demo comienza con la aceptación del cliente, no con el envío de la solicitud ni con la emisión de la oferta.

## 2. Decisiones de producto para implementar

| Tema | Decisión propuesta |
| --- | --- |
| Planes incluidos | Starter y Pro; reutilizar el modelo comercial existente aunque varios nombres internos digan Starter. Free conserva su flujo propio y suma avisos operativos. |
| Inicio de demo | Aceptación explícita de una oferta vigente y versionada, emitida desde Oracle. |
| Alcance gratuito | Una primera demo personalizada de la página pública: diseño, navegación y contenido representativo del negocio y del paquete. |
| Fuera de la demo | Panel administrador funcional, pagos, pedidos, automatizaciones, integraciones y operación real. Formularios y controles de muestra indican que son demostrativos. |
| Costo fase 0 | $0; no crear un checkout, un pago ficticio ni una orden pagada de importe cero. |
| Precio posterior | Conservar las cuatro fases pagadas y el reparto actual de 25% cada una, con redondeo en la última. El total no aumenta por añadir fase 0. |
| Aceptación inicial | Autoriza desarrollar la demo; no cobra automáticamente ni obliga técnicamente a iniciar las fases pagadas. Explicarlo en la propuesta y versionar los términos correspondientes. |
| Inicio de trabajo pagado | Fase anterior terminada + pago de la fase actual confirmado + acción «Iniciar fase» en Oracle. |
| Cierre de fase | Acción explícita del operador con evidencia; pagar una fase no significa terminarla. |
| Pagos adelantados | Para el flujo nuevo, mostrar el calendario completo pero habilitar solo la siguiente fase. Los contratos anteriores conservan sus reglas. |
| Ajustes | Conversación persistente y solicitud de cambios; revisar el alcance no acepta automáticamente una oferta. |
| Continuidad | Un proyecto, un slug y un historial desde la fase 0 hasta la entrega final. |
| Ritmo de demo | Objetivo interno orientativo de unas horas de trabajo. No prometer una cuenta regresiva si depende de disponibilidad humana. |
| Retención | Demo disponible mientras la solicitud siga activa. Pausar, archivar o cancelar será una acción explícita con motivo; no introducir borrado automático por vencimiento. |

## 3. Lo que existe y lo que falta

La evidencia siguiente corresponde al checkout local inspeccionado, no a una auditoría de producción.

| Pieza | Evidencia actual | Cambio necesario |
| --- | --- | --- |
| Aceptación comercial | `workers/public-api/src/routes/commercial-intakes.ts`, ruta `/:id/offers/:offerId/accept`, acepta la oferta y llama a `ensureImplementationPhases`. | Para ofertas nuevas, iniciar fase 0 sin habilitar checkout. |
| Órdenes y sitio | `packages/db/src/repositories/lmwares-starter-work-orders.ts`, `ensureFromPaidBillingOrder`, exige fase 1 pagada y luego crea el sitio del cliente. | Reservar la identidad del sitio al aceptar la demo; enlazar después la orden pagada a ese mismo sitio. |
| Dependencia de datos | `0031_lmwares_starter_client_projects.sql` y el modelo `starter-client-project.ts` relacionan el sitio con una orden de trabajo; esta exige `billing_order_id` en `0025_lmwares_starter_work_orders.sql`. | Permitir identidad de sitio sin orden pagada durante fase 0, mediante migración compatible. |
| Subdominio | `workers/public-api/src/routes/starter-sites.ts` sirve una ficha HTML de estado, no los archivos de una demo personalizada. | Resolver pantalla de espera o versión publicada de la demo/desarrollo. |
| DNS y base | `workers/public-api/wrangler.toml` declara rutas para `*.lmwares.com` y `*.sitios.lmwares.com`; `FREE_SITE_BASE_DOMAIN` está en `sitios.lmwares.com`. | Introducir una base comercial separada para nuevos sitios, sin cambiar las URLs Free ni las ya emitidas. |
| Administración | En **Paquetes → detalle** (`CommercialIntakesPage.tsx`) existen «Enviar a revisión del cliente», «Marcar lista para publicar» y «Confirmar publicación». | Añadir un panel explícito de fases 0–4, pagos, evidencias y acciones. |
| Dominio final | La UI de publicación pide una URL `.lmwares.com`; existe resolución de dominios personalizados activos. | Separar dirección de desarrollo y dirección canónica de producción. |
| Ofertas y respuestas | El repositorio versiona ofertas y bloquea crear otra cuando ya hay una aceptada. No se encontró una conversación de ajustes para el cliente en el flujo inspeccionado. | Añadir hilo de mensajes, revisión y sustitución controlada de versiones. Auditar también la acción de rechazo descrita por el usuario, sin asumir que su API ya existe. |
| Notificaciones | Hay outbox `lmw_notifications`, leases/reintentos y dispatcher en `free-jobs-internal.ts`; el runner Free lo utiliza. | Añadir eventos comerciales y avisos operativos sin depender de que se cree una página Free para despacharlos. |
| Correo | Binding `EMAIL`, remitente/reply-to y `ADMIN_ALERT_EMAIL` ya existen. La configuración productiva local limita destinatarios a `lmwareservice@gmail.com`. | Reutilizar el transporte y revisar esa restricción para los avisos a clientes. |
| Telegram | La búsqueda en apps/workers/packages no encontró un transporte de bot; las coincidencias son opciones de contacto social. | Implementar un adaptador de salida para los avisos operativos. |

Hay dos conceptos previos de fases: metodología del agente en `docs/four-phase-methodology.md` y fases comerciales de pago. El plan añade un ciclo comercial explícito; no debe renumerar automáticamente las fases técnicas del registro interno de Oracle.

## 4. Recorrido completo y control de fases

1. El cliente envía la solicitud. Oracle la muestra en Paquetes; Telegram avisa con negocio, plan y correo de la cuenta.
2. El operador revisa el alcance y emite la propuesta con demo gratuita, alcance de implementación, importes y condiciones.
3. El cliente puede «Aceptar y comenzar mi demo gratis», «Solicitar ajustes» o «No continuar».
4. Al aceptar, el servidor registra la versión/condiciones aceptadas, reserva el sitio y el slug, crea fase 0 y una tarea de demo pendiente. Todo es idempotente y recuperable.
5. «Mis sitios» muestra inmediatamente la tarjeta y «Abrir mi sitio». La URL abre la pantalla de preparación. Correo y Telegram informan al operador que debe comenzar la demo.
6. El operador toma la tarea, enlaza un proyecto real de Oracle y desarrolla la demo. La aplicación coordina el trabajo; no debe fingir que el agente empezó si no ha tomado la tarea.
7. Se sube una versión verificable al mismo subdominio. El operador la revisa y pulsa «Terminar fase 0 y habilitar fase 1».
8. El cliente recibe «Tu demo está lista», puede abrirla, escribir comentarios o pagar la fase 1 para continuar.
9. El pago confirmado habilita «Iniciar fase 1». El operador avanza y termina las fases sucesivas desde el mismo panel.
10. En fase 4 se valida dominio personalizado, TLS, entrega final y preparación para buscadores. El sitio de desarrollo mantiene su identidad e historial.

### Fases visibles

Los nombres siguientes son la propuesta comercial nueva; los alcances precisos se congelan en cada oferta.

| Fase | Entrega | Entrada | Cierre manual |
| --- | --- | --- | --- |
| 0 — Demo pública | Muestra personalizada navegable de la web pública | Propuesta aceptada; sin pago | Demo publicada y revisada por el operador; habilita pago 1 |
| 1 — Implementación inicial | Convertir la demo en la base del proyecto contratado | Fase 0 terminada y pago 1 confirmado | Evidencia de implementación; habilita pago 2 |
| 2 — Funcionalidad y módulos | Conectar los módulos y flujos incluidos | Fase 1 terminada y pago 2 confirmado | Flujos acordados funcionando; habilita pago 3 |
| 3 — Revisión y ajustes | Validación con el cliente y preparación de entrega | Fase 2 terminada y pago 3 confirmado | Checklist y observaciones resueltas; habilita pago 4 |
| 4 — Despliegue e indexación | Dominio final, publicación y preparación SEO | Fase 3 terminada y pago 4 confirmado | URL final verificada y evidencia de tareas de indexación |

Terminar una fase debe ser posible aunque la siguiente no esté pagada. La fase siguiente queda «Pendiente de pago». No reutilizar ciegamente las transiciones actuales, que mezclan avance y compuertas del pago siguiente.

El botón de cierre presenta la entrega, el importe siguiente y el efecto para el cliente. Registrar operador, fecha, versión del estado y evidencia. Reabrir una fase requiere motivo; si ya hay trabajo o pago posterior, marcar revisión manual, conservar recibos y no borrar avances ni cobrar otra vez.

## 5. «Mis sitios» y pantalla de preparación

La tarjeta del sitio debe existir desde la aceptación y mostrar negocio, plan, fase actual, estado, último avance, «Abrir mi sitio» y «Mensajes». Los botones de pago aparecen solo cuando corresponda. Llevar al usuario a la tarjeta recién creada tras aceptar, con foco y scroll coherentes en móvil.

Texto sugerido para la pantalla inicial:

> Tu demo está siendo creada.
>
> Estamos preparando una primera versión de la página de [negocio]. Vuelve aquí más tarde: este mismo enlace mostrará tu demo cuando esté lista. Te avisaremos para que puedas verla con calma.

Usar una ilustración de una página que se va formando, con movimiento CSS suave, el nombre público del negocio y estados comprensibles: «Propuesta aceptada», «Preparando tu demo» y «Lista para ver». Mostrar el estado real: si la tarea aún no fue tomada, indicar «Tu demo está en preparación; pronto comenzaremos».

Añadir «Volver a Mis sitios» y «Enviar una idea o referencia», que llevan al área autenticada. Si hay una fecha estimada registrada por el operador, mostrarla como estimación. No usar porcentajes inventados ni una cuenta regresiva que se reinicia.

La animación debe respetar `prefers-reduced-motion`, funcionar en móvil y no bloquear la salida. La página sigue funcionando sin JavaScript. Con JavaScript, consultar solo el estado público aproximadamente cada 30 segundos mientras la pestaña esté visible; pausar en segundo plano y aplicar backoff ante errores. Al quedar lista, ofrecer «Ver mi demo» o recargar una única vez para mostrarla.

Si hay retraso o tarea bloqueada, mantener una explicación útil y una vía de contacto. En el entorno comercial, mostrar una etiqueta discreta «Demo» o «En desarrollo» y evitar transacciones reales. No publicar correo del cliente, mensajes, brief completo ni datos de Oracle.

## 6. Alojamiento: servir la demo real en la misma dirección

Decisión propuesta: para nuevos proyectos comerciales usar `https://<slug>.lmwares.com`, con `COMMERCIAL_SITE_BASE_DOMAIN=lmwares.com`. Persistir el hostname emitido por proyecto. No recalcular los sitios existentes al cambiar una variable ni modificar `FREE_SITE_BASE_DOMAIN`.

Reutilizar la reserva de slugs y reforzar su unicidad entre Free y comerciales: una reserva debe tener propietario explícito y creación atómica; no basta con consultar disponibilidad y después insertar. Mantener excluidos dominios operativos y rutas más específicas. Verificar DNS/TLS real antes del piloto: una declaración en Wrangler no prueba que las rutas estén desplegadas.

Para fase 0, publicar un build estático de la web pública en R2 privado, bajo un prefijo por proyecto y versión. El Worker resuelve el hostname y sirve exclusivamente la versión activada. Modelo sugerido: `lmw_site_releases`, con identidad del proyecto, número/id de release, prefijo de artefactos, estado de validación, fecha y autor. Añadir al proyecto `active_release_id` y, cuando corresponda, `production_release_id` y `canonical_hostname`.

No aceptar «cualquier URL» para usarla como proxy de una demo. El upload/activación pertenece a un proyecto autenticado y debe verificar manifest, `index.html`, MIME, rutas permitidas, límites de archivos y hash de artefactos. No reutilizar una ruta pública de media que permita leer versiones no activadas. El Worker no debe adjuntar credenciales ni exponer endpoints administrativos al servir HTML del cliente; revisar además que las cookies de la cuenta no se compartan con subdominios de clientes.

La operación de publicación incluye: subir build inmutable → validar → comprobar carga y assets → activar puntero de versión. Un error de build conserva la versión anterior; antes de la primera versión mantiene la pantalla de preparación. El cierre de fase 0 exige un release válido y una comprobación funcional, no solo introducir un enlace.

Durante las fases pagadas, los siguientes builds se publican bajo la misma identidad. Al conectar APIs funcionales, usar rutas y autorizaciones por proyecto ya existentes; si el runtime requiere una app separada, registrar un destino administrado y autorizado, no un proxy arbitrario. Probar también navegación profunda, assets, separación entre clientes y actualización de caché.

Las demos y versiones de desarrollo llevan `noindex` y quedan fuera de los sitemaps de producción. En fase 4, verificar propiedad/DNS/TLS del dominio final, activar el release validado, establecer canonical y sitemap y retirar `noindex` solo de la publicación final. El subdominio puede mantenerse como desarrollo sin indexación; «Mis sitios» distingue «Abrir sitio publicado» y «Ver desarrollo». Si el cliente no elige dominio propio, permitir publicar en el subdominio mediante decisión explícita, sin imponer contratación de mantenimiento.

«Indexación terminada» significa que se completaron configuración y solicitudes pertinentes, no que Google ya indexó. Para sitios generales no usar la Google Indexing API como mecanismo universal: está limitada a páginas `JobPosting` o `BroadcastEvent` dentro de `VideoObject`. Consultar [documentación oficial de Google](https://developers.google.com/search/apis/indexing-api/v3/using-api).

## 7. Propuestas con conversación y solicitud de ajustes

Añadir un hilo dentro de cada solicitud/proyecto, accesible desde «Mis sitios» y desde Paquetes en Oracle. En la oferta, «Solicitar ajustes» abre un formulario breve con motivo opcional —alcance, diseño, precio, módulos, tiempos u otro— y mensaje obligatorio. Aceptar texto y enlaces a referencias en esta versión; los archivos adjuntos quedan fuera del primer alcance para no introducir otro flujo de carga sin necesidad.

Cada mensaje conserva autor, fecha, solicitud, versión de oferta relacionada y estado leído. Oracle puede responder y enviar una nueva versión de propuesta. El cliente conserva el historial y ve claramente qué cambió y cuál es la versión vigente. «No continuar» permite un motivo opcional, cierra la solicitud y notifica al operador.

Reglas de negociación:

- Pedir ajustes antes de aceptar deja la oferta en revisión; no empieza una demo ni abre pagos. La oferta anterior deja de ser aceptable mientras se revisa. Oracle podrá emitir una nueva versión o confirmar una propuesta sin cambios mediante nueva versión.
- Aceptar una versión obsoleta o caducada devuelve conflicto y muestra la versión actual. Resolver la carrera entre aceptación y petición de ajustes con escritura condicional sobre la versión.
- Durante la demo, comentarios normales no bloquean todo el proyecto. Una solicitud explícita de cambio de alcance/precio abre una revisión comercial pendiente y bloquea habilitar un nuevo cobro hasta resolverla.
- Una oferta ya aceptada es inmutable. Una revisión acordada crea una nueva versión/sucesora y exige aceptación del cliente; conserva la demo, el slug y el historial. No iniciar otra demo gratuita por reaceptar una revisión.
- Si ya hubo pagos o hay transferencias/checkouts pendientes, conservar importes y comprobantes y mostrar un trámite de ajuste manual. No permitir que una reedición sobrescriba órdenes pagadas ni reutilizar la reapertura actual sin revisar sus supuestos.
- Aclaraciones y respuestas deben generar avisos, con enlaces al hilo. Aplicar autenticación, propiedad, origen permitido, escape de texto, límite de longitud, paginación y control de frecuencia.

## 8. Avisos por Telegram, correo y cuenta

Telegram será un canal operativo de salida hacia un chat privado del operador. Los botones abrirán Oracle o el sitio; aprobar fases y responder al cliente se hará dentro de Oracle con su sesión habitual. No hace falta construir un bot conversacional para cubrir esta necesidad.

| Evento confirmado | Telegram al operador | Correo al operador | Aviso al cliente |
| --- | --- | --- | --- |
| Solicitud Free recibida | Sí, diferenciar de página publicada | No por defecto | Estado existente |
| Página Free publicada | Sí: negocio, correo disponible y enlace | No por defecto | Conservar aviso de publicación |
| Fallo de generación Free | Sí, referencia y motivo resumido | Si requiere intervención | Estado comprensible |
| Solicitud Starter/Pro recibida | Sí: negocio, plan, correo y enlace a Oracle | No por defecto | Confirmación en cuenta |
| Propuesta emitida/revisada | Sí | No por defecto | Cuenta y correo |
| Propuesta aceptada: comenzar demo | Sí, prioridad de trabajo | **Sí, obligatorio** | Confirmación y enlace al sitio |
| Ajuste solicitado o mensaje del cliente | Sí: extracto y enlace al hilo | No por defecto | Confirmación en hilo |
| Respuesta del operador | Registro operativo, sin alerta redundante al autor | No | Cuenta y correo |
| Cliente decide no continuar | Sí, motivo si lo aportó | No por defecto | Confirmación |
| Demo lista / fase terminada | Sí: fase, negocio y siguiente acción | No por defecto | Cuenta y correo; pago solo cuando corresponda |
| Pago confirmado, fallido o en revisión | Sí, fase y referencia sin datos sensibles de pago | Conservar alertas críticas existentes | Estado de pago en cuenta |
| Error de publicación o demo bloqueada | Sí | Sí si requiere intervención | Estado útil, sin detalles internos |
| Dominio final publicado | Sí, enlace canónico | No por defecto | Cuenta y correo |

El correo del usuario puede incluirse en el chat privado cuando exista en la cuenta/solicitud; usar el de la cuenta como identidad y diferenciar otro contacto aportado. No deducir un usuario de Telegram a partir del correo. Si falta, mostrar «Correo no disponible» con el identificador de solicitud.

Ejemplo: «Nueva demo por comenzar · Clínica Ejemplo · Starter · cliente@ejemplo.com · Propuesta v2 aceptada · Fase 0 gratuita», con «Abrir en Oracle» y «Abrir subdominio».

### Entrega fiable

Reutilizar el patrón de outbox y leases existente, pero crear una **outbox operativa separada** (`lmw_operational_notifications`) para mensajes al operador. La tabla actual enlaza usuarios y solicitudes Free y también alimenta la cuenta; insertar allí alertas internas podría mezclarlas con avisos del cliente.

Un evento de negocio persistido produce entregas independientes por destinatario y canal. Guardar evento y outbox en la misma operación transaccional del cambio o usar reconciliación durable por eventos; no depender exclusivamente de llamadas externas posteriores al commit.

El dispatcher opera en `public-api`, reutiliza `EMAIL` y añade transporte Telegram. `admin-api` registra eventos/outbox en D1 y no necesita copiar el token del bot. Usar un disparo inmediato por cola y un barrido de recuperación dedicado, aproximadamente cada minuto, sin acelerar el cron horario existente de conciliación de pagos. La pérdida de un mensaje de cola no debe perder el evento.

Cada entrega tiene clave única `evento + canal + destinatario`, lease, intentos, siguiente reintento y resultado del proveedor. Evitar duplicados lógicos por doble clic, webhook repetido o relectura del outbox. Tratar 429 respetando `retry_after` y aplicar backoff en fallos temporales. Telegram no ofrece una garantía general de envío exactamente una vez: tras un timeout ambiguo puede haber una repetición; incluir un identificador estable de evento y documentar esa limitación. Ver [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage).

Un fallo de Telegram/correo no revierte la aceptación ni un pago. Oracle debe mostrar «Pendiente», «Enviado» o «Requiere atención» y permitir reintentar con control de permisos. No llamar al estado del proveedor «Leído». Enmascarar token, URLs del proveedor que lo contienen y datos sensibles en los logs.

## 9. Diseño de datos y compatibilidad

### Modelo recomendado

1. Añadir `workflow_version` persistido en la oferta/ciclo: `legacy_v1` para existentes y `demo_v1` para nuevas ofertas habilitadas. Persistir alcance de demo, condiciones y snapshot de precios aceptados. El flag de lanzamiento solo controla nuevos ingresos; las reglas de proyectos ya creados dependen de su versión.
2. Extender la identidad de sitio `lmw_starter_client_projects` para que `work_order_id` pueda ser nulo en fase 0, conservando unicidad cuando se asigne. Añadir hostname estable y vínculo al ciclo comercial. No crear una orden pagada falsa para cumplir una FK.
3. Crear un ciclo por solicitud (`lmw_project_lifecycles`, nombre sugerido): cliente, sitio, versión de workflow, oferta aceptada vigente, estado operativo, versión para concurrencia y vínculo opcional al proyecto real de Oracle. Mantener historial de ofertas aceptadas, incluso cuando una sea sustituida.
4. Crear `lmw_project_phases`, única por ciclo + número 0–4: estado de trabajo, importe/snapshot, referencia de orden de cobro cuando exista, inicio, cierre, operador y evidencia. El estado de trabajo se consulta junto al pago; no duplicar `paid` como autoridad financiera independiente.
5. Crear tareas de demo con estado pendiente/en curso/bloqueada/lista/cancelada, responsable y referencia de artefactos. Una por ciclo; el enlace al registro real se establece al tomarla. No crear repositorios ficticios.
6. Crear releases del sitio, mensajes de conversación y solicitudes de revisión, y outbox operativa. Añadir repositorios y contratos de API asociados.

En `demo_v1`, aceptar la propuesta no ejecuta `ensureImplementationPhases`. El calendario de importes se presenta desde el snapshot. Al cerrar fase 0, crear de forma idempotente las cuatro órdenes 1–4 con los importes congelados, pero autorizar checkout solo para la fase elegible. La existencia de una orden `ready` no basta para autorizar el cobro.

Al confirmarse pago 1, `ensureFromPaidBillingOrder` puede seguir creando la orden de trabajo real, pero debe enlazar el sitio/ciclo preexistente y reutilizar el proyecto Oracle ya asignado a la demo. No reservar un segundo slug ni reiniciar el trabajo. Los reintentos y reconciliadores deben converger al mismo resultado.

### Compuertas obligatorias en servidor

- Toda entrada a checkout, incluidos endpoints antiguos, enlaces directos y reintentos, comprueba workflow, fase 0 terminada, revisión comercial resuelta y fase elegible.
- Iniciar fase pagada exige fase anterior terminada y pago confirmado por los mecanismos actuales. Terminarla exige que haya sido iniciada y evidencia suficiente.
- Para `demo_v1`, la ausencia de una orden de pago no equivale a pago satisfecho. El fallback histórico que permite fases sin fila solo puede operar en `legacy_v1`.
- Las antiguas APIs de `assign`, `status` y `publish` deben delegar en las reglas nuevas para estos ciclos o rechazar operaciones incompatibles. No puede existir un bypass desde el botón antiguo.
- Los webhooks confirman dinero; no completan fases. Si una confirmación llega tras cancelar/reabrir, preservar el cobro y enviar a revisión, sin iniciar trabajo automáticamente.
- Conservar control de propiedad en cuenta y permisos de escritura de Oracle. Los GET y abrir un enlace de Telegram nunca mutan fases.

### Migración

Inventariar referencias a `workOrderId` y los CHECK/FK antes de generar la siguiente migración disponible. No editar migraciones ya aplicadas. La nulabilidad del vínculo exige ensayar en D1 las reconstrucciones necesarias, índices, FK y triggers.

Mantener contratos anteriores, pagos realizados, ofertas emitidas, sitios Free, slugs y URLs existentes. Clasificar explícitamente proyectos activos y ofertas sin aceptar como legacy; la nueva experiencia aplica a propuestas nuevas. Una conversión manual de una oferta anterior requiere una versión nueva explicada al cliente. No reenviar alertas históricas durante backfill.

Preservar la funcionalidad de descuentos y su idempotencia: congelar el total efectivo, no consumir varias veces el cupón al reaceptar/reintentar ni perderlo al pedir una corrección. Auditar la reapertura de ofertas y conciliación de cobros, que actualmente asumen que tener una orden de trabajo implica fase 1 pagada.

## 10. Plan de ejecución para el agente

El encargo de este documento es preparar implementación completa; este turno solo produjo el plan. Al recibir autorización para implementarlo, avanzar por estos hitos dejando cambios y pruebas revisables. Cargar credenciales y habilitar producción se hace al final, con alcance y destino verificados.

| Hito | Trabajo | Criterio de salida | Dificultad |
| --- | --- | --- | --- |
| A. Contrato y migraciones | Estados, workflow versionado, fases, sitio previo al pago, releases, conversación y eventos. | Migración ensayada desde esquema limpio y copia representativa; invariantes, FK y datos históricos preservados. | Alta |
| B. Aceptación y fase 0 | Propuesta gratuita, aceptación idempotente, reserva de sitio, tarea y vista en cuenta. | Aceptar crea un solo sitio con URL funcional y cero checkouts; repetir no duplica trabajo. | Alta |
| C. Conversación comercial | Ajustes, respuestas, rechazo, versiones y resolución de revisión. | Cliente pide cambios, operador responde/reemite y cliente acepta versión vigente con historial completo. | Media |
| D. Demo real y continuidad | Pantalla animada, upload de artefactos, publicación por release, vista pública y actualizaciones. | Un build personalizado reemplaza la espera en la misma URL y un fallo conserva la última versión. | Alta |
| E. Panel 0–4 y pagos | Acciones manuales, pruebas de gates en APIs nuevas/antiguas, enlace de orden/sitio tras pago. | Completar 0 habilita pago 1; pago confirmado habilita iniciar 1; ningún atajo salta la secuencia. | Alta |
| F. Avisos | Eventos, outbox operativa, dispatcher, correo/Telegram, reintentos y monitor en Oracle. | Todos los eventos de la matriz llegan al canal previsto; fallos no pierden negocio ni exponen datos internos. | Media/alta |
| G. Dominio y entrega | Separar URL de desarrollo/final, resolver dominio, canonical, robots/sitemap y evidencias. | Dominio autorizado sirve release correcto; demo no indexable; cierre final refleja comprobaciones reales. | Media/alta |
| H. Piloto y handoff | Validación integral, configuración real, activación gradual, guía y evidencia. | Un proyecto nuevo recorre 0–4; un Free y un legacy conservan funcionamiento; alertas verificadas en cuentas controladas. | Alta |

Dependencias: A precede a B/C; D necesita B; E necesita A/B/D; los eventos de F deben añadirse al implementar cada acción, aunque sus transportes se validen juntos; G y H cierran el flujo. No usar la notificación como sustituto de crear la tarea de demo.

### Superficies del código

- Dominio/validación/API cliente: `packages/domain/src/models/`, `packages/validation/src/`, `packages/api-client/src/public-client.ts` y `admin-client.ts`.
- Persistencia: `infra/d1/migrations/`; repositorios de offers, billing-orders, starter-work-orders, starter-client-projects y notifications; nuevos repositorios del ciclo, fases, releases, conversación y avisos operativos.
- Cliente: `apps/public-web/src/features/account/AccountCenterModal.tsx`, componentes de cuenta asociados, `PackageBuilderPage.tsx` y página de pago. Revisar aceptación, respuesta de API, cálculo de ofertas activas, enlaces y refresco de la cuenta.
- Oracle: `apps/admin-web/src/pages/CommercialIntakesPage.tsx`, `apps/admin-web/src/lib/commercial-flow.ts` y rutas de detalle/enlaces desde alertas.
- API pública: `workers/public-api/src/routes/commercial-intakes.ts`, `account.ts`, `starter-sites.ts`, `payments.ts`, `free-jobs-internal.ts`, `index.ts`, `src/env.ts` y transportes de notificación.
- API administrativa: `workers/admin-api/src/routes/commercial-intakes.ts` y autorización de proyectos; añadir controles por fases, releases y mensajes.
- Runner: reutilizar autenticación y patrones de la organización local para subir artefactos y registrar resultados; integrar tarea comercial explícita, sin convertir el runner Free en generador automático de demos comerciales por accidente.
- Configuración: `workers/public-api/wrangler.toml`, configuración/bindings del despacho y ejemplos locales sin secretos.

Antes de editar, revisar `AGENTS.md`/RTK y `git status`. El checkout inspeccionado contiene cambios ajenos en pagos, `env.ts`, pruebas de seguridad y el ajuste reciente de scroll de `PackageBuilderPage.tsx`. Preservarlos y preparar diffs acotados; no hacer limpieza masiva ni incluirlos en un commit de esta tarea.

### Pruebas de aceptación obligatorias

1. Aceptar propuesta nueva dos veces y desde dos pestañas: un ciclo, una tarea, un sitio, un slug y un evento de aceptación.
2. Solicitud enviada pero propuesta no aceptada: no demo iniciada ni sitio comercial generado.
3. Aceptar muestra tarjeta y espera dinámica; abrir desde móvil y con movimiento reducido funciona; el correo no se filtra en HTML/estado público.
4. Subir/activar demo sirve HTML, assets y rutas del proyecto; otra cuenta no puede subir ni activar releases ajenos. Slugs simultáneos de Free/comercial no colisionan.
5. Cerrar fase 0 sin release válido falla; cerrarla con demo revisada habilita pago y aviso al cliente una sola vez.
6. Intentar cobrar/iniciar fase 1 antes del cierre, adelantar fase 2, usar endpoint antiguo o cambiar IDs falla en servidor.
7. Pago 1 confirmado/repetido/reconciliado enlaza la orden al mismo sitio; pendientes, fallidos y revisiones no habilitan trabajo. No simularlo con cabeceras de usuario.
8. Terminar fase 1 sin pago 2 es válido; iniciar fase 2 sin pago 2 no. Repetir hasta fase 4 y validar reapertura controlada.
9. Pedir ajuste bloquea aceptación de la oferta en revisión; reemisión conserva historial. La carrera aceptar/ajustar produce una sola decisión válida.
10. Negociar una modificación durante la demo conserva sitio y artefactos; no duplica cupón/demo. Con dinero o transferencia pendiente requiere resolución manual.
11. Eventos Free, solicitudes, aceptación, mensajes, pagos y publicación generan los avisos correctos; email/Telegram se recuperan tras caída, 429, timeout, restart y lease vencido. Ningún aviso interno aparece en la cuenta del cliente.
12. El navegador mantiene la espera actualizada sin petición continua en segundo plano. Demo lista avisa también cuando el cliente cerró la pestaña.
13. Dominio final solo sirve proyecto autorizado, SSL funciona y apunta al release correcto; canonical/sitemap/noindex distinguen producción de desarrollo.
14. Regresión de Free y contratos legacy, incluidos sus pagos anticipados/históricos, URLs y cambios de estado previos.

Ejecutar typecheck/build y suites relevantes según los paquetes modificados, pruebas funcionales con D1 real local y navegador con sesiones reales o fixtures de autenticación válidos. Los tests que solo comparan cadenas de código no sustituyen estos recorridos.

### Activación y recuperación

Crear flag para emitir ofertas `demo_v1`, apagado durante instalación. Desplegar primero migraciones compatibles y backend capaz de leer ambos flujos; luego UI/dispatcher y validar un caso privado. No activar propuestas nuevas si el sitio no resuelve o faltan transportes requeridos.

Comprobar con mensajes de prueba identificados la recepción real en el buzón operativo y Telegram. Verificar también correo de demo lista a una cuenta controlada de cliente; que `EMAIL.send` acepte un mensaje no prueba que llegó a bandeja de entrada.

El rollback de entrada desactiva nuevas ofertas demo; los ciclos ya aceptados siguen atendidos por su versión persistida. Nunca revertir a un binario que no entienda registros demo_v1 después de empezar el piloto. Se puede revertir un release del sitio al anterior sin alterar pagos, mensajes ni estado de aceptación.

Al terminar, actualizar el runbook comercial, documentar la relación con la metodología técnica, y enlazar un handoff verificado desde README. Entregar comandos y resultados, pruebas de navegador, IDs de piloto, configuración requerida, limitaciones y distinción entre local/desplegado/verificado.

## 11. Dónde configurar claves y destinos — último paso

Esta sección define la configuración para la implementación; no se han leído ni modificado secretos en esta planificación. Las guías de Cloudflare orientaron la reutilización de `EMAIL` y la centralización del envío en public-api.

### Telegram

Crear o elegir un bot en `@BotFather`, obtener su token y abrir una conversación con él mediante `/start`. Para notificar a un grupo privado, añadir el bot al grupo. Telegram requiere que la conversación se haya iniciado o el bot se haya añadido al grupo; ver [introducción oficial](https://core.telegram.org/bots) y [BotFather](https://core.telegram.org/bots/features#botfather).

El agente debe preparar una utilidad local de configuración que lea el token del entorno y consulte `getUpdates` para mostrar solo el `chat_id` candidato, sin volcar otros mensajes ni el token. Confirmar el chat de destino por su nombre antes de configurar avisos. Para un bot existente con webhook, no desregistrarlo: obtener el chat desde su integración actual o crear un bot dedicado. El sistema de avisos de este plan solo necesita envío de salida, sin webhook de comandos.

En **Cloudflare → Workers & Pages → `starter-public-api` → Settings → Variables and Secrets**, entorno de producción:

| Nombre | Tipo | Valor |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Secret | Token de BotFather |
| `TELEGRAM_ADMIN_CHAT_ID` | Secret | Identificador del chat privado o grupo operativo |
| `TELEGRAM_NOTIFICATIONS_ENABLED` | Variable | `1` después de validar el transporte |

Estos nombres Telegram son nuevos y deben incorporarse al código/configuración del plan. La consola permite añadirlos como secretos cifrados; ver [documentación de secretos de Workers](https://developers.cloudflare.com/workers/configuration/secrets/).

### Correo operativo y al cliente

En el mismo Worker, configurar `ADMIN_ALERT_EMAIL` con tu buzón operativo. El valor observado en el archivo local de producción es `lmwareservice@gmail.com`; no se presupone que ese sea el buzón que quieras conservar ni que coincida con la configuración remota. Es una dirección de destino, no una contraseña.

Se conserva `EMAIL_FROM=notificaciones@lmwares.com` y `EMAIL_REPLY_TO=soporte@lmwares.com` si siguen siendo los remitentes autorizados. El binding existente `EMAIL` evita añadir una contraseña SMTP o una nueva API key al proyecto. Habilitar/verificar el dominio remitente en Cloudflare Email Service y revisar las restricciones de destinatarios: el archivo inspeccionado permite únicamente el buzón operativo, por lo que debe adaptarse para los correos transaccionales a clientes. Ver [bindings de envío](https://developers.cloudflare.com/email-service/configuration/send-bindings/) y [API de Workers para correo](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).

### Desarrollo local

Guardar las variables sensibles en `C:\dev\oracle\workers\public-api\.dev.vars`, excluido de Git; usar un bot/chat de prueba y transportes simulados por defecto. Los ejemplos versionados solo llevan nombres y valores de muestra. No poner tokens en `VITE_*`, en el frontend, en mensajes ni en el plan.

El agente debe incorporar las variables no sensibles a los bloques de configuración correctos de Wrangler, mantener explícita la configuración por entorno y evitar que un despliegue posterior sustituya destinos elegidos en la consola. Reutilizar los secretos actuales de pagos y el acceso de despliegue de Oracle sin copiarlos al bot. No se requiere una clave de IA nueva para el bot de avisos ni para la pantalla animada.
