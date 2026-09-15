# Demo Studio: desafío de Cloudflare y máxima autonomía

Estado: base de recuperación implementada localmente; integración de checkpoint
de extensión y ensayo controlado pendientes.
Fecha nominal: 2026-09-15, en continuidad con el plan de resiliencia.

## Objetivo y experiencia final

Demo Studio trabaja en segundo plano. Si ChatGPT presenta una verificación que puede terminar sola, el supervisor espera y continúa automáticamente. Si requiere una persona, abre únicamente el navegador dedicado en la página afectada. El usuario resuelve la verificación o inicia sesión; el sistema detecta que terminó, cierra esa ventana ordenadamente y regresa al trabajo de fondo sin pedir que se pulse «Consultar trabajo».

La intervención humana se limita a la verificación solicitada por el proveedor. Se busca reducir su frecuencia conservando una sesión válida; no hay garantía de cero desafíos porque la política pertenece al proveedor. No se necesita modificar Cloudflare de LMWares: el desafío observado pertenece al acceso a ChatGPT.

Este documento complementa `LMWARES-DEMO-STUDIO-RESILIENCE-IMPLEMENTATION-PLAN-2026-09-15.md` y prevalece sobre sus conclusiones provisionales acerca del desafío.

## Implementación local de 2026-09-15

Se incorporaron `browser-access-probe.mjs`, `browser-access-state.mjs`,
`browser-access-supervisor.mjs` y `browser-session-manager.mjs`. El runner los
invoca en cada renovación sin permitir que el supervisor reescriba
`active-run.json`: el estado se guarda atómicamente en
`control/browser-access-state.json` y está cercado por `runId` y
`executionGeneration`.

La sonda CDP solo clasifica superficie pública (challenge, login, acceso listo,
red o extensión); no lee conversaciones, cookies, credenciales ni tokens, y no
intenta resolver Turnstile. Ante challenge espera 45 segundos configurables,
permite una sola apertura de recuperación y exige 10 segundos de acceso estable
antes de solicitar el retorno al escritorio aislado.

La transición de perfil usa `Browser.close`, espera la liberación del puerto y
solo entonces lanza el modo visible o aislado con el mismo perfil. Un timeout no
usa cierre forzado ni crea un segundo propietario. Está preparada pero queda
desactivada por defecto mediante `LMWARES_DEMO_ACCESS_AUTOMATION=false`; se
habilitará tras incorporar la barrera/checkpoint durable de la extensión y
probarla con una sesión dedicada no comercial. La observación no destructiva se
ejecuta aun con esa opción apagada.

## 1. Lo comprobado y lo que falta comprobar

- En pruebas previas con perfil nuevo, Brave 153 headless llegó a ChatGPT y mostró «Un momento…» junto con un iframe de `challenges.cloudflare.com`.
- El sincronizador no encontró el worker esperado. Esto no demuestra que Cloudflare impidiera cargar la extensión: son dos problemas que requieren diagnóstico separado. El timeout observado en el sincronizador ocurrió después de solicitar `chrome.runtime.reload()`; debe distinguirse worker inicial de worker posterior a recarga.
- La prueba gráfica en escritorio aislado tampoco completó la sincronización. Solo se comprobó creación del escritorio y lanzamiento del proceso, no generación desatendida ni continuidad de renderizado.
- En el código actual, cambiar `ExecutionMode` no mueve un navegador existente: el launcher reutiliza un proceso del mismo perfil sin verificar su modo real.
- `stop-brave-demo-studio.ps1` utiliza `Stop-Process -Force`. No sirve como mecanismo normal para conservar el estado recién obtenido tras una verificación.
- `sync-browser-extension.mjs` evalúa una función async para guardar configuración, pero no pasa `awaitPromise: true` a `Runtime.evaluate`; verificar la escritura requiere corregir ese contrato.
- La extensión local 0.3.13 considera observable un documento oculto por una marca de URL o configuración. Esa marca no prueba que el navegador esté renderizando. Debe retirarse esa equivalencia y conservar las comprobaciones reales de observabilidad.

Por tanto, primero se establece una base funcional y se mide; no se descarta definitivamente headless por una prueba con perfil nuevo ni se da por validado el escritorio aislado.

## 2. Decisión: supervisor local independiente de la extensión

El supervisor Node controla el navegador dedicado, clasifica el acceso y administra la transición entre modo de fondo y modo visible. Debe funcionar incluso cuando la extensión o su content script no están disponibles en la página de verificación.

La extensión conserva la autoridad sobre etapas, anclas y resultados de generación. El runner conserva el lease. El supervisor solo recibe la proyección necesaria y persiste su estado operativo por separado para no competir por la escritura completa de `active-run.json`.

Componentes propuestos:

- `browser-access-supervisor.mjs`: máquina de estados persistente y coordinación de efectos.
- `browser-access-probe.mjs`: observación acotada por CDP del navegador dedicado; devuelve categorías, no cuerpos de conversaciones.
- `browser-session-manager.mjs`: identidad de procesos, modo, cierre ordenado, lock de perfil y reapertura.
- `control/browser-access-state.json`: estado versionado, escritura atómica y un único autor.
- Bridge/extensión: barrera de pausa y reconciliación del intento al volver.

La sonda observa señales públicas de la página; no hace clic en el desafío, no extrae tokens y no introduce mecanismos de evasión. No se debe depender de endpoints internos de ChatGPT para certificar que el acceso está listo.

## 3. Reducir desafíos antes de pedir ayuda

1. Usar un único perfil dedicado persistente, con la extensión instalada y la sesión inicial establecida de forma normal.
2. Mantener mismo navegador, perfil y configuración entre fondo e intervención. Evitar cambios gratuitos de motor, modo, red o user-agent durante una recuperación.
3. No borrar cookies ni almacenamiento al terminar demos; tampoco copiar cookies del navegador personal. Dejar que el navegador conserve su sesión normalmente.
4. Separar «fin del trabajo» de «destruir sesión». Evaluar mantener el navegador dedicado de fondo durante un intervalo de inactividad configurable; medir consumo de memoria frente a reducción de arranques/desafíos.
5. Evitar recargas y reconexiones continuas. Primero observar; después recuperar solo si hay evidencia y un presupuesto disponible.
6. Permitir que una comprobación automática del proveedor termine por sí sola. Ventana inicial propuesta: 45 segundos, configurable, sin clics automáticos.

Orden de evaluación: navegador gráfico en escritorio aislado con sesión persistente; después headless con ese mismo perfil, de forma secuencial y con cierre correcto. Elegir el modo que demuestre generación y recuperación reales con menor intervención. Si ninguno mantiene renderizado/acceso estable, evaluar una VM gráfica con consola cerrada. No activar por defecto un modo que solo compiló.

## 4. Detección y estados

| Estado | Evidencia requerida | Decisión |
| --- | --- | --- |
| background-running | Página de trabajo accesible y observador operativo | Continuar etapa. |
| access-checking | Indicadores de verificación y aplicación aún no lista | Esperar hasta el plazo de comprobación automática. |
| human-required | Verificación persiste o login/MFA explícitos | Guardar checkpoint y preparar ventana dedicada. |
| interactive-wait | Navegador dedicado visible en página afectada | Usuario resuelve; supervisor observa automáticamente. |
| access-restored | Verificación ausente y aplicación accesible de forma estable | Cerrar ordenadamente y volver al modo de fondo. |
| background-verifying | Navegador de fondo reiniciado con el mismo perfil | Verificar acceso, extensión, chat e intento. |
| recovery-paused | Desafío reaparece, usuario cierra ventana o expira presupuesto | Preservar estado y comunicar acción concreta. |

Clasificaciones independientes: `challenge`, `login-required`, `access-denied`, `network-unavailable`, `extension-unavailable`, `chat-unavailable`, `ready`, `unknown`. Un error HTTP 403, el título «Un momento…», un iframe suelto o la ausencia del compositor no bastan por sí solos para decidir que existe un desafío activo. Combinar señales y registrar confianza; un iframe de Turnstile puede existir sin bloquear la aplicación.

Cuando haya señales ambiguas, observar de nuevo; no cerrar una generación por inferencia débil. Un challenge de un dominio de descarga se registra por separado del acceso al chat; no abrir automáticamente URLs arbitrarias ni recursos firmados en otra sesión.

## 5. Apertura y retorno automáticos

1. Persistir `runId`, `executionGeneration`, `attemptId`, conversación, estado de envío y checkpoint. Crear un `recoveryId` y una intención de transición durable.
2. Activar una barrera de acceso: las alarmas y «Consultar» pueden observar, pero no enviar prompts mientras se cambia de modo. Si la extensión no responde, la barrera debe existir en el bridge y comprobarse antes de nuevos envíos.
3. Si una respuesta sigue accesible y generándose, permitir su captura antes de cambiar de proceso. Si el desafío impide observarla, conservar el envío como incierto y reconciliar después; no duplicarlo.
4. Solicitar cierre ordenado por el canal del navegador dedicado. Esperar salida del proceso y liberación del perfil. Verificar identidad por ruta exacta normalizada del perfil y ejecutable, no por coincidencia parcial de texto.
5. Abrir una sola ventana visible con el mismo perfil y navegador, en la conversación afectada o en ChatGPT si aún no existe conversación. Mostrar «Demo Studio necesita verificar el acceso. Al terminar, esta ventana se cerrará y la demo continuará». No usar ni cerrar el navegador personal.
6. Sondear cada 2–3 segundos sin recargar. Comprobar que desapareció el bloqueo y volvió la aplicación. Para un chat guardado, confirmar conversación y superficie de trabajo; para login, verificar que la sesión permite recuperar el contexto esperado. No confundir un compositor anónimo con sesión restaurada.
7. Exigir estabilidad en tres observaciones y al menos 10 segundos como valores iniciales. Una redirección incompleta no activa el cierre. Si el usuario está escribiendo o aparece otra verificación, aplazar el retorno.
8. Ofrecer una breve cuenta regresiva de cierre cancelable en el monitor dedicado. Cerrar ordenadamente para permitir que el navegador escriba su estado de sesión; nunca terminar a la fuerza como camino normal.
9. Reabrir en el modo de fondo validado, con el mismo perfil. Verificar ausencia de desafío, extensión cargada, observabilidad real y chat correcto. Después retirar la barrera.
10. Reconciliar el intento original: capturar resultado disponible o continuar observándolo. Repetir una etapa solo mediante la política persistente de resiliencia, no como efecto de haber resuelto el desafío.

`Browser.close` cierra todas las ventanas de ese proceso: solo es admisible porque el proceso/perfil se reserva a Demo Studio. Una ventana de ese perfil abierta externamente debe detectarse como conflicto antes de cerrar.

Si el cierre ordenado supera 20 segundos, conservar el estado y diagnosticar. No convertir automáticamente ese timeout en un cierre forzado que arriesgue la persistencia recién conseguida.

## 6. Límites que evitan molestar al operador

- Una única ventana y una única transición activas por perfil. Repetir clics, alarmas o reiniciar el supervisor no abre duplicados.
- Una apertura automática inicial por incidente. Si el usuario cierra la ventana antes de resolver, interpretar que aplazó la intervención; no reabrirla cada pocos segundos.
- Espera humana inicial de hasta 15 minutos, configurable. Al agotarse, guardar checkpoint y marcar espera aplazada; no cerrar una ventana donde el usuario esté interactuando.
- Si el desafío vuelve inmediatamente al retornar a fondo, detener el ciclo tras ese retorno fallido. Registrar `background-access-not-stable`; no alternar ventanas indefinidamente.
- Con Windows bloqueado, diferir la intervención visible hasta desbloqueo. Tras suspensión, sondear estado real antes de ejecutar acciones vencidas.
- Durante una espera humana acotada se mantiene la propiedad del job. Si se pierde el lease, no reanudar esa generación; preservar diagnóstico y aplicar el mecanismo de reasignación existente. Definir explícitamente la transición al agotar espera para evitar renovación infinita o reencolado inmediato repetitivo.

## 7. Implementación por fases y criterios de salida

### A. Base verificable y corrección del corte anterior

Archivos: launcher, sincronizador, cerrador y host de escritorio aislado; `content.js` y sus pruebas.

Corregir `awaitPromise`, separar comprobación de versión de recarga, no recargar un worker que esté trabajando, y diferenciar extensión instalada/detenida/incompatible de bloqueo de página. Verificar el modo real de un proceso existente y la titularidad exacta del perfil. Quitar bypass de observabilidad basado solo en hash/configuración. Versionar la fuente completa de la extensión en Oracle o en repositorio propio con un origen canónico y sincronización reproducible antes de nuevos cambios operativos.

Salida: extensión y contenido renderizado funcionan en el modo elegido; evidencia de lifecycle, texto e imagen reales. La prueba con perfil nuevo sirve para instalación; la de sesión persistente sirve para operación normal. Son ensayos distintos.

### B. Detector y política persistente

Implementar sonda CDP acotada y máquina de estados con reloj inyectable. Persistir tiempos, categoría, transición pendiente, reintentos, identidad y razón del bloqueo. No guardar cookies, credenciales ni texto del desafío/conversación.

Salida: fixtures distinguen challenge automático, challenge humano, login, red caída, extensión ausente y página lista; no hay falsos «resuelto» por desaparición de un único elemento.

### C. Intervención y retorno

Implementar lock de perfil, cierre ordenado, apertura única, observación de resolución y retorno con verificación. Añadir monitor con causa, estado y cuenta regresiva cancelable. Corregir ejecución tras reinicio en cada punto: intención registrada, proceso cerrado, ventana abierta, acceso resuelto y fondo reiniciado.

Salida: el usuario solo resuelve acceso; el sistema vuelve por sí mismo y nunca abre dos procesos propietarios del perfil.

### D. Integración con generación y lease

Bridge, `demo-service-worker.js`, runner y monitor/Admin: barrera de envío, identidad de generación, checkpoints y actualización de estado. La aprobación/publicación comercial sigue siendo humana; resolver un desafío no la autoriza.

Salida: un resultado tardío y la reconexión simultánea no duplican captura, envío ni release. «Consultar» utiliza la misma máquina de estados y no repone presupuestos.

### E. Ensayo real de aceptación

Prueba controlada con sesión persistente: trabajo de texto e imagen, interrupción de acceso, intervención cuando el proveedor la solicite y continuación a revisión privada. No provocar desafíos borrando cookies de producción. Usar fixtures locales para reproducibilidad y observaciones reales para compatibilidad del proveedor.

Casos obligatorios: resolución automática sin ventana; resolución humana con cierre/retorno; login adicional; cierre voluntario de ventana; desafío que reaparece; caída del supervisor en transición; sesión Windows bloqueada; lease reemplazado; red caída; extensión ausente; respuesta completada mientras se verificaba acceso.

Medir por modo: desafíos por ejecución, intervenciones por demo, tiempo hasta apertura necesaria, tiempo desde resolución hasta reanudación, retornos fallidos y duplicados. Objetivos iniciales: cero envíos/capturas duplicados, cero reaperturas repetitivas tras aplazamiento y retorno automático en menos de 60 segundos desde acceso estable cuando el navegador responde normalmente. Reportar muestra y limitaciones; no convertir una demo correcta en garantía de disponibilidad permanente.

## Resultado esperado

La autonomía máxima alcanzable con ChatGPT Web combina sesión persistente, ejecución de fondo comprobada y recuperación automática; cuando el proveedor exige una persona, el sistema prepara y termina todo lo que rodea esa intervención. Si el proveedor exige verificaciones repetidas incluso con el modo validado, la dependencia humana residual debe informarse y medirse. Una API oficial sería una alternativa de arquitectura para eliminar la dependencia del navegador, con costes y capacidades propios, no un mecanismo para saltarse el desafío.
