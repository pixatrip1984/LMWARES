# Demo Studio: plan de implementación de resiliencia

Fecha del documento: 2026-09-15 (continuación del documento solicitado).
Análisis realizado: 2026-09-14, fecha del entorno.
Estado: primer corte local implementado; el atasco entre runs está confirmado y
requiere el fix prioritario y la aceptación empírica definidos en la sección 9.

Actualización de implementación (2026-09-14): se implementó el primer corte local en el runner/bridge y en la fuente instalada de la extensión. La ruta `headless` se probó dos veces con un perfil desechable; Brave 153 reportó `HeadlessChrome` y ChatGPT entregó un desafío de Cloudflare, sin worker de la extensión. Por tanto queda como diagnóstico, no como modo de producción. Se agregó `isolated-desktop` como modo por defecto: crea un escritorio Win32 separado y ejecuta allí Brave gráfico, de forma que su pestaña puede mantenerse activa sin ocupar el escritorio del operador. El host C# compiló y ejecutó un proceso de prueba en ese escritorio. La validación con el perfil dedicado quedó diferida porque hay un run comercial activo en `awaiting_chat` / `attention`; no se debe arrancar ese perfil hasta aislar o resolver ese run.

## 0. Corrección de alcance: segundo plano real en Windows

Esta sección prevalece sobre cualquier criterio posterior que considere suficiente mantener Brave abierto en el escritorio. El usuario requiere que la demo se ejecute mientras trabaja en otras aplicaciones, sin mantener una ventana de ChatGPT abierta ni supervisar generaciones. La primera versión de este plan cubría recuperación pero dejaba sin resolver ese requisito.

Evidencia adicional: `scripts/lmwares-commercial-demo-runner/start-brave-demo-studio.ps1` lanza Brave con `--new-window` y `Start-Process ... -WindowStyle Normal`. Las flags contra throttling no convierten esa ejecución en un proceso sin interfaz. Cambiar únicamente a `WindowStyle Hidden`, minimizar la ventana o moverla a otro escritorio virtual no demuestra renderizado independiente de la visibilidad.

### Arquitectura objetivo

Un supervisor local iniciado automáticamente en Windows administra un navegador sin interfaz visible, un perfil exclusivo de Demo Studio y la extensión. El navegador sigue existiendo como proceso porque el flujo actual utiliza ChatGPT Web; no aparece una ventana de trabajo en el escritorio del operador. El supervisor aplica los checkpoints y la recuperación definidos en este documento. Admin muestra avance y bloqueos sin necesitar el popup de la extensión.

Ruta principal propuesta: Chromium con modo headless moderno, en una distribución y versión verificadas que permitan cargar esta extensión. Evaluar primero Brave instalado; si no cumple, validar una distribución Chromium de automatización compatible. No asumir que cualquier Chrome permite las mismas flags de extensión. Conservar perfil aislado, identificar procesos propios y verificar native messaging, service worker, descargas y renderizado antes de adoptar el motor. No compartir el perfil del navegador personal ni abrir simultáneamente el perfil dedicado en dos procesos.

El supervisor puede arrancar mediante una tarea de Windows al iniciar sesión, sin consola visible. El alcance inicial es trabajar mientras el usuario usa otras aplicaciones. Ejecutar con sesión cerrada es una capacidad adicional que exige pruebas propias de identidad, perfil y native messaging; no basta con marcar la tarea como ejecutable sin sesión. Durante suspensión/apagado no hay cómputo local: debe reanudarse automáticamente al volver el equipo.

### Fase 0 obligatoria — Prueba de viabilidad sin ventana

Debe completarse antes de invertir en el resto del fix y antes de afirmar que existe segundo plano real:

1. Inventariar versiones y probar el lanzamiento headless con perfil de prueba aislado, sin tocar la sesión comercial activa. Confirmar que no aparece ventana ni cambia el foco.
2. Verificar que carga la extensión correcta, ejecuta sus alarmas y conecta con el native host. Ajustar registro del host por navegador si procede; el ID de la extensión y la identidad del protocolo deben permanecer verificables.
3. Probar login persistente de ChatGPT y lectura/renderizado del chat. El acceso inicial o una renovación de sesión pueden requerir una ventana temporal explícita; después cerrarla y devolver el perfil al proceso headless. No automatizar evasión de CAPTCHA ni de controles de acceso.
4. Medir lifecycle real en headless. Adaptar los guards de `content.js` para exigir observabilidad comprobada del documento, sin exigir foco del escritorio. No eliminar las validaciones de identidad ni declarar visible una página que no se puede observar.
5. Completar generación de texto, imagen, materialización y descarga con el operador usando otro navegador y con todas las ventanas visibles de ChatGPT cerradas. Registrar permisos, rutas de descarga y archivos verificables.
6. Interrumpir worker/proceso, reiniciar y recuperar el mismo checkpoint; comprobar que no existe un segundo navegador usando el perfil ni un envío duplicado.

Salida exigida: evidencia reproducible de todo el recorrido hasta revisión privada en Admin sin ventana de ChatGPT en el escritorio. Un lanzamiento headless exitoso o un DOM accesible por sí solos no aprueban esta fase. Este documento propone esa ruta; todavía no está probada en el Windows del usuario.

### Alternativa si ChatGPT Web no funciona de forma estable en headless

Evaluar un navegador gráfico dentro de una máquina virtual dedicada que se ejecute en segundo plano, con su propio escritorio, perfil y supervisor. La VM debe probarse con su consola cerrada; no asumir que cerrar RDP conserva renderizado activo. Verificar recursos, arranque automático y conectividad del bridge; no exponer el puerto de depuración a la red. Esta alternativa conserva ChatGPT Web pero añade coste operativo. Su instalación se define solo después de demostrar que falla la ruta principal y de concretar requisitos del equipo.

Una integración API eliminaría la dependencia del navegador, pero cambia autenticación, facturación y posiblemente modelos/capacidades. No se introduce como sustitución silenciosa de ChatGPT Web. Si ni headless ni una sesión gráfica aislada satisfacen el objetivo, presentar esa decisión con evidencia y costes antes de cambiar proveedor o modelo de ejecución.

### Cambios adicionales y criterio final corregido

Ampliar el trabajo a `start-brave-demo-studio.ps1`, `stop-brave-demo-studio.ps1`, `sync-browser-extension.mjs`, configuración del supervisor y arranque de Windows. Sustituir la suposición de ventana visible por un contrato de proceso, perfil, canal y observabilidad. El cierre debe limitarse al proceso dedicado identificado. No lanzar automáticamente una ventana visible como fallback si falla el modo headless: registrar causa y recuperar o solicitar la intervención concreta.

La instalación y los ensayos quedan para el agente implementador; este encargo sigue siendo arquitectónico. El criterio final es conjunto: ejecución sin ventana de ChatGPT en el escritorio, recuperación automática acotada y entrega privada a Admin. Recuperación funcionando únicamente con Brave visible es un resultado incompleto. Login caducado, cuota o indisponibilidad del proveedor son excepciones explícitas; la generación normal no debe exigir supervisión humana.

## 1. Decisión de arquitectura

Introducir una política persistente de supervisión y recuperación por etapa. El content script observa ChatGPT; el service worker decide las transiciones; el runner conserva la propiedad del trabajo y detecta la ausencia de la extensión. Renovar un lease, recibir un sondeo o cambiar un mensaje de estado no equivale a avanzar en la generación.

«Consultar trabajo» debe ejecutar la misma reconciliación que las alarmas automáticas y devolver una decisión verificable: sigue avanzando, se está recuperando, está esperando un reintento o necesita una intervención concreta. No debe reiniciar los presupuestos de tiempo ni los contadores.

Se conserva lo validado por `LMWARES-DEMO-STUDIO-CONTINUATION-2026-09-15.md`: solicitud, propuesta, inicio automático, ensamblado, entrega privada a Admin y actualización del cliente. Aprobar/publicar continúa siendo una decisión humana.

## 2. Evidencia y límites

Se revisaron el documento de continuidad, el diagnóstico anterior y el código local de la extensión y del runner. El checkout Oracle contiene cambios previos; este trabajo añade únicamente este plan. No se reprodujo una interrupción en un navegador real, no se ejecutaron generaciones ni se verificó qué versión está cargada en Brave. Las causas siguientes son defectos identificados en código; su contribución a cada incidente real debe confirmarse con una traza.

| Hallazgo | Evidencia local | Consecuencia |
| --- | --- | --- |
| Consultar reanuda la observación, pero no aplica un presupuesto persistente de recuperación | `demo-popup.js`, `refreshWork`; `demo-service-worker.js`, `studio:refresh-work`, `reconcileActiveJob`; `content.js`, `resumeJob` | El mismo intento puede volver a quedar observándose o en `attention`. |
| Los fallos de imagen se descartan | `handleJobResult` deriva toda etapa image a `captureActiveAsset`; esta retorna false cuando `!message.ok` | Timeout, cuota o fallo de imagen pueden dejar intacto el trabajo activo y un estado engañoso. |
| El timeout depende de la vida del observador | `content.js`, `observeJob`: `started = Date.now()`, deadline local de 12 minutos; `resumeJob` crea otro observador cuando no existe | Recargar el documento o recrear el observador concede tiempo nuevo al mismo intento. |
| La pausa por pestaña oculta es incompleta | `observeJob` amplía deadline al volver visible, pero el while termina al alcanzar deadline incluso si sigue oculta | Una ocultación prolongada puede consumir el plazo y emitir timeout pese a la intención de pausarlo. |
| El progreso no distingue vida de avance | `observeJob` comunica cambios de observación; `save` actualiza `updatedAt`; `observationFor` reduce los datos y no conserva lifecycle | No hay reloj persistente fiable para diferenciar observador vivo, contenido estancado y documento no observable. |
| El runner renueva propiedad sin evaluar avance | `scripts/lmwares-commercial-demo-runner/cli.mjs:81`, `renewActiveRun` | Un lease saludable puede coexistir con una demo detenida. |
| Los reintentos son asimétricos | `captureCodeFragment` reintenta ciertos errores hasta dos veces; el plan pasa a attention y el fallo image se descarta | El comportamiento depende de la etapa y no de una política común. |

La corrección de visibilidad ya existe: activación del chat vinculado, tratamiento `page-hidden` y alarmas cada 30 segundos. Hay pruebas de reanudación y de no duplicación del prompt en `demo-bootstrap.test.cjs`; deben ampliarse, no asumirse inexistentes. El caso de pestaña cerrada también tiene recuperación en `ensureWorkspaceOnce`; no debe diagnosticarse como ausente por leer aisladamente `inspectOrRestoreBoundChat`.

## 3. Contrato propuesto

Persistir una estructura versionada `recovery` junto al trabajo activo, con migración compatible del estado actual:

- Identidad: `runId`, `executionGeneration`, `conversationId`, `stage`, `stageItemId` (asset o fragmento), `attemptId`, `userTurnId`, hash del prompt y `recoveryEpoch`.
- Envío: `preparedAt`, `commitRequestedAt`, `commitConfirmedAt`, identidad del turno observado. Distinguir envío confirmado de envío incierto.
- Tiempos: `attemptStartedAt`, `lastObserverSeenAt`, `lastProgressAt`, `lastObservationAt`, `lastVisibleAt`, tiempo observable acumulado, `attemptDeadlineAt` absoluto y `nextActionAt`.
- Evidencia: hash de contenido, longitud, identidad y firma del resultado/candidato, cantidad y dimensiones de imágenes, lifecycle, código de error y estado de observabilidad. No persistir prompts ni respuestas completas en telemetría.
- Presupuestos: recargas y reintentos consumidos por etapa, acción pendiente, motivo y último resultado. Una recarga o consulta no los reinicia.
- Checkpoints: plan validado, assets materializados y fragmentos validados ya disponibles. Conservar archivos y hashes existentes.

`lastObserverSeenAt` avanza con una señal periódica aunque el DOM no cambie. `lastProgressAt` solo avanza ante evidencia relevante de la respuesta vinculada: contenido cambiado, nuevo turno esperado, imagen materializada o resultado validado. Un botón de detener persistente no prueba progreso. Una animación, un cambio de estado del supervisor o una consulta tampoco.

La extensión es autora del checkpoint de generación. El bridge mantiene una proyección saneada para el runner y Admin, sin reemplazar la autoridad del lease del servidor. `executionGeneration` cerca operaciones antiguas: todo resultado o acción se descarta si pertenece a otra generación/intento/época. Verificar también el tab y la conversación del remitente.

## 4. Máquina de estados y recuperación

| Estado lógico | Condición | Acción siguiente |
| --- | --- | --- |
| observing | Observador responde y hay progreso reciente | Seguir observando el mismo intento. |
| waiting-observable | Documento oculto, congelado o sin canal | Activar/restaurar el chat vinculado y volver a sondear, sin enfocar Windows. |
| stalled-suspected | Observador vivo sin progreso durante el umbral | Sondeo de confirmación y captura de resultado válido antes de intervenir. |
| recovering | Estancamiento confirmado o canal perdido | Restaurar/reabrir/recargar de forma acotada el mismo chat; localizar el turno y recuperar resultado. |
| retry-scheduled | Fallo transitorio confirmado, sin resultado recuperable | Esperar backoff y repetir solo la etapa pendiente con un nuevo attemptId. |
| intervention-required | Login, cuota, turno ambiguo, chat eliminado o presupuesto agotado | Persistir causa y acción concreta; no repetir prompts ni alternar indefinidamente estados. |
| completed | Resultado capturado y validado | Consumir checkpoint una vez y avanzar a la siguiente etapa. |

Estos estados pueden mapearse a los estados visuales existentes. No ampliar de entrada los enums comerciales ni las migraciones D1: verificar primero el contrato de proyección disponible.

Secuencia de recuperación:

1. Releer identidad y propiedad vigentes antes de decidir.
2. Examinar el chat y recuperar un resultado válido ya producido antes de considerar otro envío.
3. Si falta observabilidad, restaurar el canal y el mismo chat. Recuperar la pestaña por URL e identidad; no adoptar otro chat abierto.
4. Confirmar estancamiento con más de una observación. Aplicar recarga acotada solo después del plazo de confirmación y conservar el intento.
5. Tras recargar, localizar el turno original y revalidar. Si el envío quedó incierto, reconciliar el turno por ancla/hash; una búsqueda incompleta no autoriza reenviar. Si no se puede determinar la identidad, pedir intervención.
6. Reintentar únicamente si el intento anterior está fallido o detenido de forma verificable y el presupuesto lo permite. Cuando corresponda cancelar, comprobar que es el último turno vinculado y confirmar el cese; nunca enviar encima de una generación todavía activa o ambigua.
7. Conservar plan, imágenes y fragmentos completados. Nuevo attemptId para un nuevo envío; mismo attemptId para observar o recuperar el resultado original.
8. Al agotar presupuesto, dejar una razón estable y una acción útil. «Consultar» puede detectar que el operador resolvió login/cuota, pero no borrar presupuestos ni iniciar otro intento indefinidamente.

No se promete generación exactamente una vez frente a ChatGPT Web: no ofrece una clave de idempotencia transaccional controlada por LMWares. Sí se exige deduplicación local, recepción idempotente y tratamiento explícito del envío incierto.

## 5. Presupuestos iniciales propuestos

Valores configurables para fixtures y calibración, no métricas ya validadas:

- Alarma de reconciliación: conservar 30 segundos. Heartbeat del observador: cada 15 segundos cuando pueda ejecutarse.
- Observador ausente: sospecha tras 90 segundos; no clasificar automáticamente como fallo de ChatGPT.
- Sin avance observable: sospecha tras 3 minutos para texto y 5 para imagen; confirmar en dos sondeos separados por una alarma.
- Preservar como referencia los 12 minutos de observación por intento, con cómputo persistente. La pausa por ocultación no consume ese tiempo; un límite absoluto inicial de 20 minutos evita espera infinita por falta de observabilidad.
- Una recarga de recuperación por intento; hasta dos reintentos automáticos por etapa, con espera de 30 y 90 segundos. Cuota/login/ambigüedad no consumen reintentos de generación automáticos.
- Límite global de recuperación del run persistente y configurable: fijarlo con la cantidad de assets/fragmentos y las duraciones medidas antes de activación real. No imponer 20 minutos a toda la demo.

Cuando el sistema esté suspendido, las alarmas no garantizan ejecución puntual. Al despertar, reconciliar los timestamps y sondear primero: no reintentar en masa ni descartar un resultado terminado mientras estuvo suspendido.

## 6. Plan por entregables

### Fase 1 — Reproducción determinista y política pura

Archivos: extensión `demo-studio-core.js` o módulo nuevo `demo-recovery-core.js`, `demo-bootstrap.test.cjs` y nuevas pruebas con reloj controlado.

Crear fixtures que fallen con los defectos documentados: timeout image ignorado, observer nuevo que resetea plazo y ocultación que supera deadline. Implementar un evaluador puro `evaluateRecovery(state, observation, now)` que devuelve decisión y próximo plazo. Separar política de efectos DOM/Chrome.

Salida: cada estado no terminal tiene próximo sondeo/acción o espera explícita; ninguna consulta repone presupuesto.

### Fase 2 — Observación y recepción consistentes

Archivos: extensión `content.js`, `demo-service-worker.js`.

Emitir heartbeat distinto de progreso; conservar lifecycle y firma del candidato. Corregir cómputo visible/absoluto y limpieza del watcher en finalización. Evitar que una promoción de JSON use solo tiempo desde el primer JSON válido: exigir estabilidad del candidato actual y validación contractual antes de consumirlo.

Normalizar fallos de todas las etapas antes de dispatch a sus capturas: `code`, `status`, categoría y posibilidad de recuperación. Resolver el descarte de `!message.ok` en imagen. No confundir un fallo de descarga/materialización con necesidad de regenerar la imagen.

Salida: texto e imagen producen resultados/fallos observables y un watcher nuevo mantiene los presupuestos.

### Fase 3 — Reconciliador persistente

Archivos: extensión `demo-service-worker.js`, módulo de política y pruebas.

Conectar alarmas, startup, content-ready y Consultar al mismo ejecutor. Serializar también resultados/progreso relevantes: `workspaceTask` por sí solo no cubre todos los handlers. Persistir intención antes de cada efecto y confirmar después; al reiniciar, reconciliar una intención pendiente. Proteger efectos y capturas con identidad/época; deduplicar mensajes de resultado concurrentes. Persistir checkpoint antes de iniciar la etapa siguiente.

Implementar restauración, recuperación del resultado, reintento de etapa y salida estable a intervención. Mantener separado reobservar de reenviar.

Salida: matar y recrear el worker durante cualquier transición no duplica etapa ni borra avances.

### Fase 4 — Bridge, runner e interfaz operativa

Archivos Oracle: `scripts/lmwares-demo-native-host/studio-host.mjs`, `studio-run-state.mjs`, sus pruebas; `scripts/lmwares-commercial-demo-runner/cli.mjs` y, si resulta necesario, `daemon.mjs`. Extensión: `demo-popup.js` y su HTML.

Extender la proyección del estado con última señal del observador, último avance, causa y próxima acción. Revisar esquema actual y escritura concurrente antes de añadir campos; actualizaciones deben preservar cambios más recientes de otras capas. El runner detecta extensión ausente y solicita restauración acotada del navegador dedicado; no evalúa JSON ni reenvía prompts por su cuenta. Mantener heartbeat del lease durante recuperación acotada. Al agotarse, conservar diagnóstico/checkpoint y aplicar la transición de fallo compatible con la API existente; evitar tanto renovación infinita como abandono silencioso que genere otro trabajo automático.

Consultar responde pronto con decisión y próxima acción mientras la recuperación continúa. Mostrar tiempo sin avance, etapa afectada y acción requerida. No presentar `already-watching` como recuperación exitosa. El sondeo periódico conserva progreso y causa, sin parpadeo continuo entre `recovering` y `generating`.

Salida: la misma decisión es comprensible en popup y proyección operativa; no cambia la compuerta humana de publicación.

### Fase 5 — Validación e instalación controlada

Comprobar extensión fuente, copia instalada y manifest con hashes/versiones mediante `sync-browser-extension.mjs` antes de atribuir resultados a la corrección. Ejecutar suites existentes más las pruebas nuevas en sus directorios correctos. Instalar y probar después, como trabajo de implementación separado de este encargo arquitectónico.

Ensayo real requerido: operador trabajando en otro navegador, popup cerrado, generación interrumpida y recuperación automática hasta revisión privada en Admin. Registrar versión, run/generación/etapa/intento, timestamps, decisiones, número de envíos, checkpoints y release final, sin material privado del chat. Repetir para texto e imagen; probar reinicio del worker y reconexión del navegador dedicado. No aprobar/publicar automáticamente.

## 7. Matriz mínima de aceptación

| Escenario | Resultado exigido |
| --- | --- |
| Generación lenta con contenido avanzando | No recargar ni duplicar envío por un umbral de inactividad falso. |
| Botón de detener persistente sin avance | Detectar sospecha, confirmar y ejecutar recuperación acotada. |
| Resultado completo durante caída del worker | Capturarlo y avanzar una vez, sin regenerar. |
| Timeout/fallo/cuota de imagen | Estado y razón persistidos; retry solo si procede. |
| Texto truncado, imagen materializada tarde | Recuperación diferenciada; no regenerar assets ya válidos. |
| Ocultación mayor de 12 minutos | No timeout por tiempo visible ficticio; sí límite absoluto y causa explícita. |
| Worker reiniciado repetidamente | Presupuestos y nextActionAt no se reinician. |
| ACK de envío perdido | Localizar turno; no enviar si la identidad queda ambigua. |
| Alarma, clic y resultado simultáneos | Un solo efecto y un solo avance de checkpoint. |
| Pestaña cerrada, canal perdido, conversación eliminada | Restauración del chat existente cuando sea posible; intervención específica en caso contrario. |
| Login requerido/cuota agotada | Espera explícita sin bucle de generación; revalidación al resolverse. |
| Lease perdido o generación reemplazada | Resultado antiguo rechazado; ninguna recuperación sobre el nuevo propietario. |
| Descarga interrumpida | Recuperar captura/archivo antes de regenerar la etapa. |
| Equipo suspendido y reanudado | Sondeo inicial y presupuestos conservados, sin ráfaga de retries. |
| Presupuesto agotado | Estado estable con causa, checkpoint preservado y acción concreta. |
| Demo recuperada hasta Admin | Release privada disponible; aprobación/publicación siguen humanas. |

## 8. Orden, alcance y cierre

Prioridad inmediata: normalización de errores image y pruebas de los relojes; después política persistente, ejecutor y proyección. No sustituir esto por otro temporizador en el popup. Complejidad media-alta: el núcleo difícil es tolerar reinicios y envíos inciertos sin duplicar trabajo.

No se requiere rediseñar el flujo comercial ni migrar de ChatGPT Web a otro proveedor para este fix. Si las pruebas reales muestran que el proveedor no progresa con el navegador dedicado en las condiciones de fondo requeridas, registrar esa limitación por separado; una política de recuperación no puede garantizar disponibilidad del proveedor.

El fix se considera terminado cuando la matriz determinista pasa y los ensayos reales interrumpidos recuperan texto e imagen sin asistencia hasta revisión privada, o desembocan en un bloqueo real con causa y acción concreta dentro de los límites definidos. Pruebas locales verdes por sí solas no certifican operación desatendida.

## 9. Fix prioritario: un run nuevo no puede heredar una generación antigua

Esta sección es la instrucción vigente para el siguiente agente implementador.
Debe ejecutarla antes de continuar optimizaciones de Cloudflare o segundo plano.
Ningún cambio se considera corregido hasta completar la prueba empírica y
recibir la confirmación explícita del usuario.

### 9.1 Evidencia confirmada el 15 de septiembre de 2026

- El run activo de Mueblería "gutierrez" es
  `e4a15806-f048-4230-a335-bac7af6aa977`, generación 1, y permanece en
  `awaiting_chat` sin `studioStatus`.
- La extensión 0.3.13 informa como activo
  `creative-plan-cce59fdf-7169-4f82-90b2-fa193995efd5`, intento heredado del
  run anterior de Ferretería "El Chaparral". El sincronizador evita la recarga
  por la mera existencia de ese trabajo, sin demostrar que pertenezca al
  `runId` y `executionGeneration` actuales.
- El listener está vivo y renueva el lease cada 15 segundos. Que Admin muestre
  `claimed` solo prueba propiedad del job; no prueba que la extensión haya
  aceptado o esté observando la generación.
- `127.0.0.1:9223` no responde aunque el launcher haya registrado
  `launchedAt`. La vida del proceso, DevTools y el worker deben formar parte del
  criterio de lanzamiento exitoso.
- `control/browser-access-state.json` contiene 604 bytes nulos. El monitor
  devuelve `browserAccess:null`, sin recuperar ni explicar el estado corrupto.

La hipótesis principal es un error de identidad y reconciliación entre runs,
agravado por un falso positivo de navegador lanzado. Cloudflare puede ser una
causa adicional, pero no explica que el worker conserve el trabajo del cliente
anterior.

### 9.2 Cambios obligatorios

1. Toda generación persistida debe incluir y validar como una sola cerca:
   `runId`, `jobId`, `executionGeneration`, `attemptId`, `stage` y
   `lastObserverSeenAt`. Un `activeJob` sin identidad completa es legado/no
   confiable y nunca bloquea un run nuevo.
2. Al sincronizar, comparar el trabajo persistido con el run público del
   bridge. Solo preservarlo si coinciden `runId` y `executionGeneration`. Si no,
   registrar `stale-active-job`, conservar un resumen diagnóstico sin contenido
   privado, cancelar sus alarmas y reinicializar antes de aceptar el run nuevo.
3. Para la misma identidad, reconciliar antes de reintentar: inspeccionar
   conversación, respuesta y artefactos capturados. No duplicar prompts ni
   perder plan, imágenes o código válidos. Un retry crea nuevo `attemptId`,
   conserva el vínculo anterior y consume un presupuesto persistente.
4. Escribir `launchedAt` solo después de verificar durante una ventana estable
   DevTools, el worker esperado y una pestaña ChatGPT controlable. Si proceso o
   puerto desaparecen, marcar `browser-unavailable` aunque `studioStatus` sea
   nulo y aplicar backoff/reinicio acotado.
5. Tratar JSON auxiliar vacío, truncado o inválido como estado recuperable:
   moverlo a evidencia con timestamp, reconstruirlo cercado al run actual y
   emitir `access-state-recovered`. No degradarlo silenciosamente a `null`.
6. Publicar progreso desde el primer contacto: `run-detected`,
   `initializing-chat`, `creative-plan-generating`, `creative-plan-ready`,
   `asset-generating` con índice/total, `asset-captured`, `code-generating`,
   `output-ready`, `assembled` y `submitted-for-review`. Cada evento lleva
   identidad, timestamp y mensaje público, nunca lease, prompt o credenciales.
7. Añadir watchdog por etapa que diferencie observador vivo, generación visible,
   resultado tardío, pestaña/extensión/navegador ausentes, challenge/login y
   resultado inválido. Reconciliar primero y reintentar según presupuesto; nada
   puede permanecer indefinidamente en `claimed`/`awaiting_chat`.
8. Añadir `npm run lmwares:demos:watch -- --run-id <id>` (o equivalente) para
   emitir un snapshot JSON sanitizado correlacionando run activo, listener,
   acceso, DevTools/worker, activeJob, artefactos, ensamblaje y estado remoto.
   Debe devolver categorías parciales aunque una fuente esté caída.
9. Escribir eventos JSONL con timestamp para claim, cambio de run, lanzamiento,
   reconciliación, progreso, retry, artefacto y entrega. La rotación no puede
   borrar evidencia durante una prueba activa.
10. El arranque de Windows debe ejecutar el mismo commit/configuración probados
    y dejar esa identidad en el snapshot. La terminal visible no acredita salud;
    sí lo hacen lock único, heartbeat reciente y diagnóstico sano.

### 9.3 Pruebas automatizadas previas obligatorias

El agente implementador debe añadir y ejecutar como mínimo:

- Identidad: trabajo anterior, misma generación, generación reemplazada, estado
  legado y `activeJob` incompleto.
- Reconciliación: respuesta tardía capturada una vez; intento perdido reintentado
  una vez; reiniciar worker/daemon no duplica prompt, imagen, ZIP ni release.
- Liveness: proceso ausente, puerto caído, worker ausente/incompatible, pestaña
  ausente y recuperación posterior.
- Corrupción: estado con bytes nulos, JSON truncado y escritura interrumpida;
  archivar/reconstruir sin perder `active-run.json`.
- Watchdog con reloj inyectable para cada etapa y presupuesto agotado.
- Integración local con runs consecutivos A y B: dejar A detenido en
  `creative-plan-generating`, activar B y demostrar que B no hereda intento,
  conversación, assets ni alarmas de A.
- Reinicio completo del listener como inicio de Windows, seguido de claim,
  generación ficticia, staging, ensamblaje y entrega privada simulada.
- Suite existente de runner, bridge, extensión, ensamblaje y envío.

Los tests usan fixtures y almacenamiento temporal: no reclaman jobs reales, no
limpian el perfil comercial y no publican releases. El agente registra comandos,
resultados y commit. Tests verdes autorizan la prueba real, no declarar el fix.

### 9.4 Protocolo inmediato de aceptación real con el usuario

Después de implementar, verificar y reiniciar el listener con el commit nuevo,
el agente no termina: inicia inmediatamente este protocolo.

1. Clasificar cualquier run comercial activo. Capturar evidencia y resolverlo o
   archivarlo por la política de lease; nunca borrarlo o reemplazarlo a mano.
2. Comprobar singleton, commit/configuración, API, DevTools, worker, perfil,
   estado auxiliar válido y ausencia de `activeJob` ajeno. Guardar línea base.
3. Solo con línea base sana, enviar exactamente: **«Ya puedes enviar una
   solicitud para iniciar la prueba.»**
4. Esperar **«Solicitud N enviada»**. Tomarlo como `T0`; no asumir el número ni
   reclamar otra solicitud paralela.
5. Desde T0, consultar cada 15 segundos hasta correlacionar `jobId`, `runId` y
   `executionGeneration`, verificando claim, aceptación por la extensión y
   progreso real. Al comenzar una generación observable enviar exactamente:
   **«La demo se está generando.»**, junto con run y etapa comprobada.
6. Desde ese aviso, revisar al menos cada 3 minutos. Comunicar cambios o
   heartbeat con evidencia: `plan creativo`, `imagen 2/4`, `código`,
   `artefactos recibidos`, `ensamblando` o `enviado a revisión`. Nunca inferir
   progreso solo de `claimed`.
7. Mantener un cronómetro desde T0. A los 12 minutos advertir si no está
   entregada. A los 15 minutos, si no existe en Admin una release privada del
   mismo run, declarar incidente aunque los procesos sigan vivos.
8. Ante error o vencimiento: congelar evidencia sanitizada, clasificar causa,
   corregir, repetir suites y reiniciar ordenadamente. Volver a validar línea
   base y pedir solicitud `N+1`; no reutilizar el número anterior.
9. Repetir cuanto sea necesario. El agente permanece observando y no da por
   concluida una solicitud activa.
10. Cerrar únicamente cuando el usuario escriba **«La demo N ha llegado a
    admin»** y el agente confirme que lifecycle/job/run/release coinciden, los
    artefactos están completos, no hubo duplicados y el run fue archivado como
    `submitted_for_review`.

### 9.5 Criterio final

Se exige un recorrido posterior al fix desde solicitud hasta Admin en no más de
15 minutos, con identidades coincidentes y sin intervención manual salvo un
challenge/login real. No prueban corrección: terminal abierta, `claimed`,
heartbeats, launcher con código cero, tests aislados ni un release de otro run.

Si la confirmación visual y la correlación técnica no coinciden, registrar
`EVIDENCE_GAP` y continuar. Solo ambas evidencias juntas cierran el flujo.
