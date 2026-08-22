# LMWares + Oracle: misión, visión y hoja de ruta para la economía de agentes

Fecha: 2026-08-19
Estado: propuesta de producto y operación; no constituye una autorización de cobros, pagos ni despliegues.

## Decisión en una frase

LMWares debe evolucionar de vender y operar proyectos web con un equipo central a
una red confiable: los negociadores originan clientes, los desarrolladores
ejecutan fases en sus propios entornos de agentes y Oracle coordina el contrato,
la evidencia, las decisiones, la custodia operativa y la liberación de cada
tramo. LMWares conserva una comisión transparente por cada transacción.

Oracle no es el modelo de IA. Es el sistema de reglas, evidencia y decisiones.
DeepSeek puede ser su primer evaluador asistido, pero no su única fuente de
verdad ni su único aprobador de dinero.

## Misión

Permitir que una persona con una necesidad real convierta su solicitud en un
producto publicado y mantenible, sin depender de que una sola persona de
LMWares ejecute cada cambio. El cliente compra claridad, continuidad y una
entrega verificable; el agente gana por trabajo comprobado; el negociador gana
por traer una contratación que realmente llega a pago; LMWares gana por
coordinar el sistema con reglas comunes.

## Visión

Ser la red hispanohablante donde un vibecoder puede conectar de forma segura su
entorno habitual —Codex CLI, Claude Code, Copilot CLI u otro compatible—,
descubrir ofertas adecuadas, proponer una solución y completar proyectos con un
contrato por fases. El usuario no entrega control absoluto de su computadora:
su agente conserva su entorno y Oracle recibe sólo las capacidades, resultados y
evidencia autorizados para esa oferta.

El resultado deseado es un ciclo sostenible:

```text
Negociador capta cliente
        -> cliente define y contrata
        -> Oracle estructura contrato y fases
        -> desarrollador toma una oferta compatible
        -> agente ejecuta en su propio entorno
        -> Oracle verifica evidencia y calidad
        -> se libera el pago de la fase y se abre la siguiente
        -> publicación, dominio e indexación
        -> mantenimiento recurrente y ofertas relámpago
        -> nueva reputación, más confianza y más trabajo
```

## Punto de partida auditado

El repositorio ya contiene cimientos útiles, pero aún no la red de agentes.

| Área | Ya existe | Límite actual |
| --- | --- | --- |
| Identidad de cliente | Inicio de sesión público con Google, sesión HTTP-only y cuenta del cliente. | No existe identidad de agente, perfil de capacidades, token personal de agente ni vínculo con una CLI. |
| Administración | Panel privado de Oracle protegido por Cloudflare Access, con roles administrativos. | El modelo es de operador interno; no es un portal para agentes externos ni para negociadores. |
| Proyectos | El escáner local descubre repositorios bajo `C:\dev`, infiere fases y el panel puede sincronizarlos con el registro privado. | El descubrimiento depende del equipo del propietario; no conecta los entornos de otras personas ni prueba propiedad o disponibilidad remota. |
| Ejecución de agentes | Existe un runner local que crea worktrees y ramas, invoca Codex CLI y conserva salida, estado Git y evidencia. | Es Codex-local y para repositorios confiables; no es MCP, no admite un catálogo de adaptadores de CLI, ni crea una sesión remota de agente. |
| Contratación | Intake comercial, oferta, proyecto cliente Starter y orden de trabajo existen como conceptos separados. | La asignación del proyecto técnico sigue siendo manual por un administrador. No hay bolsa de ofertas, propuestas de agentes ni prioridad por disponibilidad. |
| Fases y pagos | La oferta puede dividir la implementación en cuatro pagos y cada transición exige el pago de su fase. | El cliente paga para abrir un gate interno; no hay dinero segregado por agente, liberación contra aceptación, reparto de comisión, payout ni disputas. |
| Calidad | Hay snapshots, validaciones locales controladas, auditoría y gates humanos previstos. | No hay evaluación automática del alcance/evidencia por un oráculo de IA, puntuación de calidad, apelación ni reputación. |
| Mantenimiento | Hay selección de plan y suscripción mensual opcional al publicar. | No hay formulario de cambio para el cliente, ticket de mantenimiento, oferta relámpago ni pago a un agente por resolverla. |
| Entrega final | Existen bases para subdominio LMWares, dominio personalizado e integración interna de notificación a Google Indexing. | El dominio y la indexación no deben darse por terminados sin sus credenciales, validación productiva y evidencia por cliente. |

La lectura correcta es: Oracle ya es un buen embrión de control operativo
interno; no está listo todavía para abrir trabajo, código ni pagos a terceros.

## Lo que no se debe confundir con la versión futura

1. Un botón que ejecuta Codex en `C:\dev` no equivale a una conexión de un
   agente externo. La conexión futura debe ser saliente desde el equipo del
   agente, revocable y limitada a una oferta concreta.
2. Un pago de implementación de 25% por fase no equivale a custodia. Hoy es una
   condición de avance del proyecto, no un saldo reservado ni una liquidación
   para un tercero.
3. Una cuenta Google de cliente y una cuenta de Cloudflare Access de admin no
   equivalen a registro de desarrollador o negociador.
4. Un modelo que opina sobre una entrega no debe transferir dinero por sí solo.
   Oracle debe conservar reglas deterministas, evidencia verificable, revisión
   humana de excepción y derecho de apelación.
5. Mantenimiento mensual no es aún un mercado de microtrabajos. Falta capturar
   el cambio solicitado, acotarlo, asignarlo y cerrarlo contra evidencia.

## Modelo operativo objetivo

### Roles

| Rol | Qué puede hacer | Cómo gana | No puede hacer por defecto |
| --- | --- | --- | --- |
| Cliente | Crear solicitud, aceptar oferta, pagar, revisar fases y pedir mantenimiento. | Obtiene el producto y su continuidad. | Acceder al entorno del agente o liberar dinero arbitrariamente. |
| Negociador | Compartir enlace/código, captar cliente, acompañar la conversión y consultar sus referidos. | Comisión sólo cuando la contratación elegible alcanza el hito definido. | Tomar o ejecutar trabajo técnico, modificar el alcance o cobrar por una venta no consolidada. |
| Desarrollador | Crear perfil, conectar su entorno, ver ofertas compatibles, proponer, tomar y entregar fases. | Mayor porcentaje de cada fase aceptada. | Ver secretos del cliente/LMWares, autoaprobarse, liberar pagos o invadir otros proyectos. |
| Oracle | Compilar el contrato, asignar, vigilar estados, reunir evidencia, calcular decisiones y ordenar pagos. | No cobra como persona: aplica la comisión y reglas de LMWares. | Ejecutar cambios o pagos irreversibles fuera de política. |
| Revisor humano LMWares | Resolver excepciones, disputas, fraude, calidad ambigua y operaciones sensibles. | Control de calidad y continuidad de la red. | Reescribir evidencia o saltarse el ledger sin dejar decisión auditada. |

### Dos canales de adquisición

- Enlace/código del negociador: toda visita, solicitud, oferta, aceptación y
  pago conserva la atribución. La comisión nace cuando se cumpla el hito
  comercial explícito, no al generar un clic.
- Entrada directa: LMWares puede atenderla y conservar la comisión de
  adquisición. Nunca debe inventarse un negociador después de la contratación.

La política inicial recomendada es pagar la comisión del negociador después del
primer pago liquidado y fuera del periodo de cancelación/contracargo. Así se
evita que la red pague adquisición con dinero aún disputable.

### Contrato por fases

Cada proyecto pasa por una especificación congelada antes de ofertarse:

1. solicitud y brief estructurado del cliente;
2. alcance, exclusiones, referencias visuales y criterios de aceptación;
3. propuesta del desarrollador seleccionado;
4. presupuesto y reparto por fase;
5. evidencia requerida, pruebas y responsable de aceptación;
6. reglas de cambio, retraso, rechazo, apelación y cancelación;
7. publicación, dominio, indexación y soporte posterior cuando apliquen.

La secuencia comercial existente de cuatro tramos puede ser el punto de partida,
pero la versión de red debe separar dos decisiones: el cliente deposita/fondea
la fase y Oracle autoriza su liberación al desarrollador cuando la fase se
acepta. No deben tratarse como el mismo evento.

## Cómo debe ser la conexión con los entornos de agentes

La propuesta es un **MCP de Oracle con control plane remoto y runner local
conectado**, no un servidor que toma control directo de `C:\dev` de otras
personas.

1. La persona crea una cuenta de desarrollador o negociador en LMWares.
2. Desde su CLI abre un flujo de vinculación por navegador o código de un solo
   uso. El usuario autentica su sesión personal y confirma el dispositivo.
3. La CLI recibe una credencial revocable asociada a ese dispositivo, no la
   contraseña ni la sesión web del usuario. Oracle muestra el ID del agente,
   capacidades declaradas, última actividad y posibilidad de revocarlo.
4. El MCP expone sólo herramientas de negocio y trabajo: perfil, ofertas,
   propuesta, asignación, contrato, fase actual, evidencia, solicitud de
   revisión y mantenimiento. Las acciones sensibles exigen confirmación y se
   auditan.
5. Un adaptador local de cada CLI traduce el contrato de Oracle a la forma de
   trabajo de Codex, Claude Code o Copilot. El contrato y la evidencia tienen
   formato común; el proveedor de agente no decide las reglas del mercado.
6. El agente obtiene una concesión por proyecto/fase con repositorio, ramas,
   permisos y expiración explícitos. No recibe secretos sin necesidad ni acceso
   a otros clientes.

Esto hace directa la adopción para vibecoders sin convertir a LMWares en el
dueño de sus estaciones de trabajo. La primera integración debe ser Codex, pues
el repositorio ya contiene ese runner; después se agregan adaptadores compatibles
sin cambiar el contrato central.

## El oráculo de calidad y seguimiento

DeepSeek puede iniciar como evaluador de bajo costo para resumir evidencia y
señalar faltantes. Su veredicto debe ser una recomendación con trazabilidad,
no una caja negra que mueve dinero.

Para cada fase, Oracle reúne el brief, propuesta aceptada, criterios, cambios
autorizados, commits/diff permitido, pruebas, URL o captura, reporte del agente
y comentarios del cliente. Produce:

- estado: cumple, requiere corrección, requiere revisión humana o evidencia
  insuficiente;
- explicación ligada a criterios concretos, no sólo una calificación;
- lista de faltantes y siguiente acción;
- puntuaciones de puntualidad, calidad técnica, calidad visual y comunicación;
- registro de la versión del evaluador y de los insumos usados.

La liberación automática sólo debe llegar después de un piloto con umbrales
conservadores. Debe ir a revisión humana si falta evidencia, hay riesgo de
seguridad, el cliente objeta, el evaluador tiene baja confianza, existe disputa
o la operación supera el límite económico configurado.

## Reputación y asignación

La reputación debe ser explicable y reversible. Una primera fórmula operativa
puede combinar: fases aceptadas, entrega a tiempo, correcciones posteriores,
calidad de evidencia, comunicación, disputas confirmadas y especialidad. Nunca
debe depender de una sola nota de IA.

Al asignar, Oracle filtra primero capacidades, idioma, presupuesto y zona
horaria; después prioriza desarrolladores sin trabajo activo que superen el
mínimo de reputación. Entre candidatos equivalentes, alterna para evitar que
los primeros perfiles absorban toda la demanda. Los proyectos de alto riesgo se
asignan sólo a reputación suficiente o revisión humana.

## Mantenimiento como mercado recurrente

Basic no debe convertir al fundador en mesa de ayuda. Un proyecto publicado
con Basic entra cada mes en una cola de mantenimiento distinta de los proyectos
nuevos. El cliente debe poder describir el cambio, adjuntar contexto, indicar
urgencia y aprobar un alcance breve.

Hay dos tipos de trabajo:

| Tipo | Ejemplo | Precio y pago |
| --- | --- | --- |
| Cobertura mensual | Ajuste pequeño incluido por el plan, revisión preventiva o actualización acotada. | Se asigna contra el presupuesto mensual del proyecto y se liquida al agente después del cierre validado, menos la comisión de LMWares. |
| Oferta relámpago | Cambio extra claramente definido: texto, sección, integración o corrección fuera de cobertura. | Precio instantáneo o cotización breve; el cliente paga antes, Oracle valida la evidencia y libera el tramo al terminar. |

El sistema debe decir con claridad qué cubre el plan, qué queda fuera, el SLA y
cuándo un cambio deja de ser relámpago para convertirse en una mini-fase. Si no
se puede medir el alcance, no debe prometer precio instantáneo.

## Hoja de ruta priorizada

Escala de dificultad: 1 = acotado, 2 = moderado, 3 = complejo, 4 = muy complejo,
5 = crítico/regulado o con alto riesgo operativo.

### Puerta previa: hacer confiable el terreno actual

| Objetivo concreto | Resultado verificable | Dificultad |
| --- | --- | --- |
| Alinear código, D1, APIs, admin y web pública antes de abrir ventas. | Una versión coherente, con evidencia de los flujos que sí se anunciarán. | 3/5 |
| Cerrar la validación pendiente de la política D1 de mantenimiento y mantener esa puerta cerrada hasta una prueba controlada. | Registro de validación concluyente y decisión explícita de apertura o cierre. | 3/5 |
| Completar una entrega de referencia de punta a punta: contrato, fases, subdominio, dominio personalizado e indexación, con evidencia por paso. | Un caso real reproducible, sin declarar terminado lo que aún sea manual. | 4/5 |

### Release A: identidad y mercado sin dinero de terceros

| Objetivo concreto | Resultado verificable | Dificultad |
| --- | --- | --- |
| Crear registros separados de desarrollador y negociador. | Perfil, estado de aprobación, especialidades, disponibilidad y términos aceptados. | 3/5 |
| Implementar atribución por enlace/código de negociador. | Un cliente conserva atribución desde la entrada hasta el hito comercial. | 3/5 |
| Crear bolsa privada de ofertas y propuestas. | Un desarrollador aprobado puede ver ofertas compatibles, proponer y recibir una asignación. | 4/5 |
| Modelar trabajos activos, disponibilidad y reputación explicable. | La asignación muestra por qué priorizó a una persona y permite revisión humana. | 3/5 |
| Publicar la nueva narrativa, onboarding y tutoriales. | Páginas separadas para clientes, desarrolladores y negociadores, sin promesas financieras prematuras. | 2/5 |

### Release B: Oracle conectado a las CLIs

| Objetivo concreto | Resultado verificable | Dificultad |
| --- | --- | --- |
| Definir contrato común de agente y permisos por fase. | Una oferta entrega alcance, evidencia, límites y criterio de cierre idénticos sin importar la CLI. | 4/5 |
| Vincular dispositivo/sesión de un agente de forma revocable. | El usuario autoriza desde navegador, puede ver y revocar el entorno conectado. | 4/5 |
| Publicar MCP de Oracle con operaciones mínimas. | Codex puede consultar ofertas, tomar una autorizada, leer contrato, publicar evidencia y solicitar revisión. | 4/5 |
| Convertir el runner Codex existente en primer adaptador externo. | Un piloto fuera de `C:\dev` trabaja aislado, sin secretos ajenos y con trazabilidad. | 4/5 |
| Añadir adaptadores Claude Code y Copilot CLI sólo después del contrato común. | Misma fase y evidencia funcionan en al menos dos entornos adicionales. | 3/5 |

### Release C: calidad, pagos y reputación con control

| Objetivo concreto | Resultado verificable | Dificultad |
| --- | --- | --- |
| Crear expediente de evidencia y evaluación asistida por DeepSeek. | Cada fase tiene criterios, insumos, dictamen explicable y siguiente acción. | 4/5 |
| Añadir revisión humana, apelación y manejo de disputa. | Ningún caso ambiguo o objetado se liquida automáticamente. | 5/5 |
| Separar el dinero fondeado de la liberación por fase. | Estados auditables para fondeo, retención, aprobación, liberación, devolución y comisión. | 5/5 |
| Diseñar liquidación a desarrollador y comisión de negociador. | Política fiscal, prevención de fraude, KYC/proveedor de pagos, mínimos, plazos y reversos definidos antes del primer payout. | 5/5 |
| Activar reputación basada en resultados reales. | Los indicadores se recalculan desde datos auditados y se pueden impugnar. | 4/5 |

### Release D: mantenimiento distribuido

| Objetivo concreto | Resultado verificable | Dificultad |
| --- | --- | --- |
| Dar al cliente un formulario de cambio desde su cuenta. | Crea una solicitud ligada a proyecto, plan, evidencias y nivel de urgencia. | 3/5 |
| Crear cola Basic y clasificación incluida/extra. | Las solicitudes se vuelven tareas de mantenimiento o ofertas relámpago con SLA visible. | 4/5 |
| Habilitar oferta relámpago y cierre por evidencia. | El cliente ve alcance/precio, paga y el agente recibe su parte tras validación. | 5/5 |
| Medir rentabilidad por proyecto y plan. | LMWares sabe si cada mensualidad cubre trabajo, comisión, soporte y riesgo. | 3/5 |

## Orden recomendado de trabajo

1. Resolver primero la coherencia productiva y terminar una entrega referencia.
   Abrir una red antes de poder publicar, dominar e indexar un proyecto propio
   multiplicaría los casos manuales.
2. Lanzar los registros de desarrollador/negociador y la bolsa en modo piloto,
   sin custodia ni payout automatizado. La asignación y el seguimiento pueden
   validarse con una cohorte pequeña y pagos administrados manualmente.
3. Conectar el primer entorno Codex mediante el MCP y un runner local saliente.
   El éxito no es "tener MCP", sino completar una fase remota con permisos
   mínimos, evidencia y revocación.
4. Añadir la evaluación asistida y los flujos de excepción antes de automatizar
   dinero. La automatización de liberación llega al final, por límites y con
   auditoría.
5. Abrir mantenimiento distribuido cuando la ejecución por fases ya sea
   confiable; así Basic escala con una cola y no con intervención del fundador.

## Métricas de que el loop funciona

- porcentaje de solicitudes que llegan a oferta, de ofertas que se aceptan y de
  contratos que terminan publicados;
- tiempo desde contratación hasta primera evidencia y hasta publicación;
- porcentaje de fases aceptadas a la primera, reabiertas y disputadas;
- proporción de desarrolladores sin trabajo activo que recibe una oportunidad;
- costo de revisión humana por fase y exactitud de las recomendaciones del
  oráculo frente a la decisión humana;
- ingresos, comisión LMWares, pago a desarrollador, comisión de adquisición y
  margen por proyecto;
- solicitudes de mantenimiento resueltas dentro del SLA, porcentaje incluido
  frente a relámpago y margen mensual por cliente;
- tasa de revocación de dispositivos, incidentes de permisos y entregas sin
  evidencia suficiente.

## Criterio de salida para abrir el piloto externo

No se invita a agentes externos sólo porque exista una pantalla de registro.
El piloto puede abrir con un número reducido de desarrolladores y negociadores
cuando se demuestre que una persona externa puede vincular un entorno, recibir
una única oferta, ejecutar una fase aislada, aportar evidencia, recibir una
decisión explicable y ser desvinculada sin dejar acceso. Los pagos a terceros
permanecen manuales y documentados hasta completar la política de custodia,
liquidación, disputa y cumplimiento aplicable.

## Riesgos que deben conservar dueño humano

- custodia, repartos, reembolsos, contracargos, impuestos y cumplimiento del
  proveedor de pagos;
- acceso de agentes a repositorios, secretos, producción y datos de clientes;
- fraude de referidos, identidades duplicadas, evidencia simulada y colusión;
- sesgo de la reputación y decisiones de asignación opacas;
- evaluaciones erróneas de IA, cambios de modelo y fuga de datos hacia un
  proveedor externo;
- promesas de dominio, publicación, Search Console o SLA que no tengan una
  validación operacional asociada.

La prioridad estratégica no es automatizar todo de inmediato. Es conseguir que
cada paso del loop tenga un responsable, una evidencia, una regla de reversión y
un camino de excepción. Eso es lo que convierte a Oracle de un panel interno en
el centro confiable de una organización de agentes.
