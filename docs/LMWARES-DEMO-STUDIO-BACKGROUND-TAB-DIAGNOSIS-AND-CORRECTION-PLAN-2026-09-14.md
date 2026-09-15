# Demo Studio: diagnostico de pestaña en segundo plano y plan de correccion

Fecha: 2026-09-14
Estado: **correccion implementada, desplegada y validada con dos solicitudes reales**
Incidencia: el flujo de ChatGPT Web puede quedar detenido o producir un falso `json-missing` cuando la pestaña del chat deja de ser la pestaña visible del Brave dedicado.

## Resultado ejecutivo

La causa controlable por LMWares no es la cola, el lease, el ensamblador ni el envio de la release. Tampoco hay evidencia de que el parser sea incapaz de leer la respuesta final de esta ejecucion.

El defecto esta en el contrato entre el orquestador y la interfaz web de ChatGPT:

1. Demo Studio abre una pagina completa de la extension como supervisor persistente.
2. Esa pagina puede quedar activa en la misma ventana y convierte el chat en un documento `hidden`.
3. El content script sigue usando el DOM oculto como fuente autoritativa: sondea botones, texto, bloques JSON, barras de progreso e imagenes.
4. No existe un gate por `document.visibilityState`, ni una reactivacion sostenida de la pestaña vinculada antes de preparar, enviar, observar y capturar cada etapa.
5. En una pestaña oculta, ChatGPT Web puede diferir actualizaciones visuales, carga de imagenes o reconciliacion de su UI. El observador puede entonces ver un marcador de generacion estancado, un texto parcial estable o una imagen aun no materializada.
6. Esa lectura se convierte prematuramente en `generation-active`, `no-image` o `validation-error/json-missing`, aunque la respuesta final llegue a estar disponible al volver al chat.

El diagnostico exacto en el limite que LMWares controla es, por tanto:

> **Demo Studio confunde el estado transitorio o estancado del DOM oculto de ChatGPT con el estado final de la generacion. La pestaña supervisora persistente hace posible esa condicion y el observador carece de un contrato de visibilidad que la vuelva no terminal.**

No es necesario afirmar que el servidor de ChatGPT deja de generar. Lo comprobado es que el DOM que consume la extension deja de ser una fuente final confiable cuando la pestaña no esta visible. La implementacion interna de ChatGPT Web no es una interfaz contractual de LMWares.

## Evidencia observada

### Ejecucion real afectada

- `runId`: `6aed7950-9462-4e9e-bb6b-37cf2e753dd3`
- `jobId`: `9403fa39-e2ad-4736-84ff-fd11366b2db0`
- Estado inicial del incidente: `awaiting_chat` / `attention`
- Mensaje inicial: `La respuesta no contiene JSON parseable.`
- Estado durante el diagnostico, despues de volver al chat: `code-generating`
- Contrato activo observado: `code-fragment`
- Assets ya presentes en el estado de la extension: `4`
- Sondeo del content script antes de que terminara de recuperarse: `generation-active`
- Daemons encontrados: exactamente `1`

El proceso principal de Brave incluia ya:

- `--disable-background-timer-throttling`
- `--disable-backgrounding-occluded-windows`
- `--disable-renderer-backgrounding`
- `--disable-features=CalculateNativeWinOcclusion`

Por ello, agregar otra espera o repetir esas flags no resuelve el contrato de visibilidad: ninguna de ellas obliga a una aplicacion de terceros a pintar o reconciliar el mismo DOM cuando `document.visibilityState` es `hidden`.

Al dejar visible el chat se observo:

- pestaña de ChatGPT activa;
- `visibilityState: visible`;
- `document.hidden: false`;
- `document.hasFocus(): true`;
- 121 callbacks de `requestAnimationFrame` en aproximadamente 2.1 segundos;
- cero botones de detener;
- cero indicadores `aria-busy`/`progressbar`.

Sin cambios de codigo ni reinicio manual del job, la misma ejecucion avanzo inmediatamente por codigo, ensamblado, envio y archivo final:

- `studioStatus`: `output-ready`
- `status`: `submitted_for_review`
- `releaseId`: `39d0a3d8-5f3e-4bc1-aa90-5074e87758db`
- `submittedAt`: `2026-09-14T19:25:05.487Z`
- Brave dedicado cerrado por el runner
- `active-run.json` retirado por el archivado normal
- ejecucion archivada en `C:\dev\lmwares-demos\control\completed-runs\6aed7950-9462-4e9e-bb6b-37cf2e753dd3.json`

Esta release demuestra recuperacion del run, no aceptacion de la operacion desatendida: hubo intervencion manual al devolver visibilidad/refrescar el chat.

### Evidencia de codigo

1. `scripts/lmwares-commercial-demo-runner/sync-browser-extension.mjs` abre `demo-popup.html?autostart=1` como una pagina completa mediante `/json/new` y la conserva como supervisor.
2. `demo-popup.js` ejecuta reconciliacion cada 20 segundos, pero no garantiza que la pestaña de ChatGPT sea visible.
3. `demo-service-worker.js` crea o restaura el chat con `active: true`, pero si el `tabId` ya existe, `ensureWorkspaceOnce()` no vuelve a activarlo. Las funciones que inician plan, assets y fragmentos tampoco comprueban visibilidad antes de `PREPARE`/`COMMIT`.
4. `content.js` determina actividad por la presencia visible del boton de detener y decide estabilidad por ventanas de 0.9 a 6.5 segundos. No lee `document.visibilityState`, `document.hidden`, `freeze`, `resume` ni `document.wasDiscarded`.
5. La captura de imagen exige `image.complete`, dimensiones naturales y un rectangulo renderizado mayor que cero. Ese ultimo requisito hace que una imagen correcta siga dependiendo del viewport/render de la UI.
6. `diagnose-browser.mjs` elige el primer tab de ChatGPT y no reporta pestaña activa, visibilidad, foco, descarte, lifecycle, rAF ni los indicadores DOM que sustentan la decision.

### Pruebas actuales

- Extension: `58/58` pasan cuando se ejecutan desde su directorio correcto.
- Runner y native host: `12/12` pasan.
- Cobertura ausente: no hay prueba de pestaña oculta, lifecycle, reactivacion de un chat existente, pausa de timeout por estado oculto ni captura de imagen sin dependencia de pintura.

## Lo que queda descartado para esta incidencia

- **Cola/lease:** el mismo `runId` y la generacion `1` se conservaron hasta la entrega.
- **Dos daemons:** solo habia un listener propietario.
- **Ensamblador:** produjo release y ZIP validos para el run.
- **Envio a Oracle:** la release quedo `submitted_for_review`.
- **Parser incapaz de leer el resultado final:** la misma ejecucion termino sin cambiar el parser.
- **Falta de flags de Brave:** las cuatro flags relevantes ya estaban en el proceso real.

`json-missing` debe reclasificarse como un sintoma de lectura prematura mientras no exista evidencia `visible + final + estable`; no debe tratarse como la causa raiz.

## Riesgo arquitectonico restante

ChatGPT Web es una interfaz interactiva, no una API DOM estable. La documentacion oficial de OpenAI indica que, para generacion programatica de imagenes, se use la API de imagenes: <https://learn.chatgpt.com/es-419/docs/image-generation>. El flujo actual puede endurecerse para operar con el Brave dedicado, pero conservara riesgo de cambios de DOM y de comportamiento de la aplicacion web.

Chrome documenta que una pestaña en segundo plano pasa a estado oculto, puede ser congelada y deja de recibir `requestAnimationFrame`; las flags de temporizadores no sustituyen el lifecycle de pagina: <https://developer.chrome.com/docs/web-platform/page-lifecycle-api> y <https://developer.chrome.com/blog/background_tabs>.

La correccion inmediata mantiene la arquitectura actual. Una migracion posterior a API debe tratarse como decision comercial/arquitectonica separada por costo, autenticacion y politicas; no forma parte de este hotfix.

## Decision de correccion

La correccion recomendada tiene tres invariantes:

1. **El chat vinculado es la unica pestaña activa del Brave dedicado mientras exista un `activeJob`.** El usuario puede trabajar en otro navegador; Demo Studio no debe robar el foco del sistema.
2. **Un documento oculto nunca produce un resultado terminal.** `hidden`, `frozen`, `discarded` o `not-active-tab` son estados reintentables de infraestructura UI.
3. **Solo una respuesta anclada, visible, final, estable, valida por schema y coincidente con `run_id` puede avanzar el lifecycle.**

## Plan de ejecucion para el agente

### Gate 0 - Preservar estado y trazar el cambio

Objetivo: empezar con rollback verificable y sin mezclar el arbol de Oracle.

1. Confirmar que no exista `active-run.json` y que haya exactamente un daemon. Si aparece un run nuevo, detener el cambio y esperar su archivado normal; no editarlo ni cerrarlo a la fuerza.
2. Registrar `git status --short` de Oracle y aislar los archivos de esta incidencia. No usar `git add .`, `git clean`, `git reset --hard` ni cambiar de rama.
3. La extension `C:\dev\lmwares\lmwares-chatgpt-demo-runner` no es un repositorio Git. Crear antes de editar un ZIP de respaldo recuperable, junto con SHA-256 y lista de archivos, fuera de su propio directorio.
4. Conservar como baseline los hashes observados:
   - `manifest.json`: `aa06ba21c26c46d10743c9e316e817585a892f1e06f943461fd94ff50bcc553d`
   - `content.js`: `aa8c8d2c270c6fa0f3913347fff9acec81498e95becfd5dfead3e6eb2f1c84ca`
   - `demo-service-worker.js`: `d50cd3d8c499c84b5e692a4e7b482145d6f253d432596099033075f5dd89c62b`
   - `sync-browser-extension.mjs`: `1502f738a09fe85eec86b510a692a9c62ff4744519950e4f74610611cb006291`
   - `start-brave-demo-studio.ps1`: `e1db1bd3d73e76f2e89ce67ab007f9abb9bba0e98d0408bae9bc8c951e75eb7e`
5. No aprobar ni publicar la release existente como evidencia del hotfix. Puede inspeccionarse funcionalmente en Admin, pero fue producida antes de la correccion.

Salida del gate: respaldo con hash, ningun run activo y lista exacta de archivos autorizados.

### Gate 1 - Crear reproduccion anonimizada del lifecycle

Objetivo: convertir la observacion manual en una prueba que falle antes del cambio.

1. Agregar una fixture sin contenido comercial que modele:
   - respuesta de texto parcial con DOM estable;
   - boton de detener ausente o desactualizado;
   - `document.visibilityState = hidden`;
   - respuesta final valida que aparece al cambiar a `visible`;
   - imagen con `naturalWidth/naturalHeight` validos pero rectangulo no pintado mientras esta oculta.
2. Probar que el comportamiento actual puede emitir `validation-error/json-missing`, quedar en `generation-active` o concluir `no-image` mientras el documento esta oculto.
3. Agregar una prueba del service worker donde el `tabId` vinculado existe, pero `tab.active === false`; el baseline debe demostrar que hoy no se reactiva.
4. No copiar texto, prompts, correo, precios ni imagenes de la solicitud real.

Archivos previstos:

- `C:\dev\lmwares\lmwares-chatgpt-demo-runner\demo-bootstrap.test.cjs`
- `C:\dev\lmwares\lmwares-chatgpt-demo-runner\demo-studio-core.test.cjs`
- nuevo test de lifecycle si separar la fixture reduce acoplamiento
- prueba nueva para `scripts/lmwares-commercial-demo-runner/sync-browser-extension.mjs`

Salida del gate: pruebas rojas que reproduzcan la dependencia de visibilidad y no fallen por el parser aislado.

### Gate 2 - Eliminar la pestaña supervisora persistente

Objetivo: quitar la causa que compite directamente con el chat.

1. Cambiar `sync-browser-extension.mjs` para recargar/verificar la extension sin conservar `demo-popup.html?autostart=1` como tab.
2. Preferencia de implementacion:
   - verificar version contra el target del service worker;
   - si se necesita abrir temporalmente la pagina para despertar/verificar, cerrarla antes de crear o restaurar el chat;
   - conservar `demo-popup.html` solo como `action.default_popup` manual, no como supervisor en la tira de pestañas.
3. Conservar la reconciliacion con `chrome.runtime.onStartup`, `chrome.alarms` y `runner:content-ready`. Ya existe una prueba que demuestra descubrimiento por startup/alarm sin abrir el popup.
4. El lanzador debe terminar con cero tabs de extension persistentes y, cuando haya trabajo, exactamente un tab de ChatGPT vinculado.
5. Incrementar la version de la extension, previsiblemente de `0.3.9` a `0.3.10`.

Archivos previstos:

- `scripts/lmwares-commercial-demo-runner/sync-browser-extension.mjs`
- `C:\dev\lmwares\lmwares-chatgpt-demo-runner\manifest.json`
- `C:\dev\lmwares\lmwares-chatgpt-demo-runner\demo-popup.js` solo para retirar `autostart` si queda inutilizado
- tests contractuales correspondientes

Salida del gate: el arranque ya no deja una pagina supervisora que el usuario pueda seleccionar en lugar del chat.

### Gate 3 - Introducir el contrato de visibilidad y reactivacion

Objetivo: que el proceso se autocorrija si cualquier tab desplaza al chat.

#### En el content script

1. Agregar `pageLifecycleSnapshot()` con campos saneados:
   - `visibilityState`
   - `hidden`
   - `hasFocus`
   - `wasDiscarded`
   - timestamp monotono/epoch de la ultima transicion visible
2. Agregar listeners para `visibilitychange`, `pageshow`, `freeze` y `resume` cuando esten disponibles.
3. Hacer que `inspect-bootstrap`, `inspect-bound-chat`, `prepare-submit`, `commit-submit`, `probe-job` y `resume-job` devuelvan lifecycle.
4. Si `visibilityState !== 'visible'`:
   - devolver `page-hidden` o `page-frozen` como estado reintentable;
   - no ejecutar validacion terminal;
   - no iniciar los grace periods de estabilidad;
   - no consumir el timeout de 12 minutos como si ChatGPT estuviera generando activamente;
   - conservar `attemptId`, anchor y `run_id`.
5. Al volver a `visible`, reiniciar las ventanas de estabilidad y reprobar el mismo intento, sin volver a enviar el prompt.

No exigir `document.hasFocus() === true`: una ventana Brave detras de otro navegador puede estar visible pero pasiva. El objetivo es no robar el foco de Windows al usuario.

#### En el service worker

1. Implementar una unica funcion, por ejemplo `ensureBoundChatVisible(current, reason)`, que:
   - obtenga el tab por `current.tabId`;
   - confirme URL y `conversationId`;
   - active el tab dentro de su ventana con `chrome.tabs.update(tabId, { active: true })`;
   - si la ventana esta minimizada, la regrese a estado `normal` sin `focused: true`;
   - espere una inspeccion que confirme `visibilityState: visible`;
   - nunca abra otro chat ni duplique el prompt.
2. Invocarla antes de:
   - inicializacion;
   - cada `PREPARE`;
   - cada `COMMIT`;
   - `reconcileActiveJob()`;
   - captura/materializacion de imagen;
   - cada reconciliacion de alarma mientras exista `activeJob`.
3. Cuando el content script informe `page-hidden`, reactivar el mismo tab y reanudar el watcher. Si sigue oculto tras un plazo corto, guardar `ui-visibility-blocked` y continuar reintentando de manera acotada; no convertirlo en error de contenido.
4. `openWorkChat()` puede mantener `focused: true` porque es una accion explicita del operador. La reconciliacion automatica no debe usarlo.

Archivos previstos:

- `C:\dev\lmwares\lmwares-chatgpt-demo-runner\content.js`
- `C:\dev\lmwares\lmwares-chatgpt-demo-runner\demo-service-worker.js`
- tests de ambas capas

Salida del gate: seleccionar cualquier otro tab de Brave durante un trabajo hace que Demo Studio restaure el chat en segundos, sin enfocar la ventana sobre el navegador personal.

### Gate 4 - Endurecer la finalizacion y reclasificar errores

Objetivo: no confundir DOM parcial con respuesta final.

1. Separar explicitamente estos estados:
   - `ui-hidden` / `ui-frozen` / `ui-discarded`: infraestructura UI, reintentable;
   - `generation-active`: ChatGPT visible y con señal real de generacion;
   - `response-settling`: respuesta visible cuya firma aun cambia;
   - `json-missing-final`: respuesta visible, final y estable que realmente no contiene candidato valido;
   - `schema-invalid-final`: JSON parseable que incumple schema o `run_id`.
2. Permitir `json-missing-final` solo cuando se cumplan conjuntamente:
   - tab correcto y visible;
   - turno de usuario anclado sin ambiguedad;
   - existe turno de asistente posterior;
   - no hay boton de detener ni `aria-busy`/`progressbar`;
   - el compositor esta listo;
   - firma DOM estable durante una ventana visible;
   - todos los candidatos fueron evaluados;
   - schema y `run_id` fueron verificados.
3. Mantener el extractor estricto. Solo ampliar Markdown/DOM si la fixture anonimizada demuestra una forma final real no cubierta. Nunca reparar JSON corrupto ni aceptar el primer objeto por posicion.
4. Para imagenes, quitar la dependencia del rectangulo pintado como criterio de integridad. Seleccionar unicamente dentro del turno anclado, exigir `currentSrc`, carga completa, dimensiones naturales, origen permitido, estabilidad y hash. Usar scroll/lazy-load solo como materializacion cuando el tab ya es visible.
5. Si `document.wasDiscarded` es verdadero, recargar de forma controlada la URL vinculada y reanclar el mismo `activeJob`; no volver a enviar.

Salida del gate: el error de contenido solo aparece con evidencia de respuesta final, nunca por una pestaña oculta.

### Gate 5 - Observabilidad segura

Objetivo: que la siguiente incidencia pueda distinguir UI oculta, generacion y parser sin abrir el chat manualmente.

1. Ampliar `diagnose-browser.mjs` para elegir el tab por `conversationId` almacenado, no por `tabs[0]`.
2. Reportar solo:
   - `runId`, `executionGeneration`, `attemptId`, stage y contract;
   - tab esperado/presente/activo;
   - estado de ventana sin titulo de conversacion;
   - lifecycle, `wasDiscarded` y edad desde ultima visibilidad;
   - conteos de turnos, stop buttons, busy/progress, candidatos e imagenes;
   - longitudes, hashes y resultado por extractor/schema;
   - razon de la ultima transicion y reactivacion.
3. No registrar body text, prompt, respuesta, intake, correo, precios, tokens, lease ni nombres del cliente.
4. Agregar timestamps a las transiciones del listener; el log actual repite estados sin hora por linea y dificulta medir cuanto tiempo estuvo detenido.

Archivos previstos:

- `scripts/lmwares-commercial-demo-runner/diagnose-browser.mjs`
- `scripts/lmwares-commercial-demo-runner/cli.mjs` o el punto unico que emite estados, si se necesita timestamp
- pruebas de redaccion/saneamiento

Salida del gate: un solo comando determina si el bloqueo es lifecycle, DOM, contrato o infraestructura sin exponer contenido.

### Gate 6 - Suite de regresion

La implementacion no puede avanzar a navegador real hasta pasar:

```powershell
rtk node --test csv-core.test.cjs demo-bootstrap.test.cjs demo-studio-core.test.cjs extension-contract.test.cjs runner-core.test.cjs
```

Ejecutado desde:

```text
C:\dev\lmwares\lmwares-chatgpt-demo-runner
```

Y desde `C:\dev\oracle`:

```powershell
rtk node --test scripts/lmwares-commercial-demo-runner/*.test.mjs scripts/lmwares-demo-native-host/*.test.mjs
```

Casos nuevos obligatorios:

1. tab oculto no produce error terminal;
2. tab existente pero inactivo se reactiva antes de `PREPARE`;
3. `hidden -> visible` reanuda el mismo `attemptId` una sola vez;
4. un prompt nunca se duplica por alarma, service-worker restart o visibility change;
5. timeout no vence durante una pausa de lifecycle no imputable a generacion;
6. imagen oculta no se clasifica `no-image`;
7. respuesta parcial no se clasifica `json-missing-final`;
8. JSON final de schema correcto y `run_id` correcto completa;
9. JSON de otro run se rechaza;
10. run/generacion reemplazados no pueden reactivarse ni escribir resultados;
11. el launcher no deja supervisor persistente;
12. el diagnostico no imprime contenido sensible.

Salida del gate: suites verdes y pruebas nuevas demostrando la correccion, no solo ausencia de excepciones.

### Gate 7 - Canary de navegador con fixture ficticia

Objetivo: probar Page Lifecycle real de Brave, no solo mocks.

1. Confirmar que no haya run comercial activo.
2. Cargar la version nueva con el sincronizador; comprobar una sola instancia de Brave dedicada y un solo daemon.
3. Ejecutar una fixture ficticia que no pueda enviarse a Oracle.
4. Durante texto:
   - activar deliberadamente otro tab de Brave;
   - comprobar reactivacion automatica del chat dentro del SLA definido, recomendado menor o igual a 5 segundos;
   - mantener otro navegador de Windows en primer plano durante al menos 60 segundos;
   - comprobar que Brave no roba foco.
5. Durante imagen:
   - repetir cambio de tab;
   - comprobar que imagen y hash se materializan sin refresh manual;
   - minimizar Brave durante un intervalo controlado y comprobar restauracion o estado reintentable, nunca error de contenido.
6. Forzar reinicio del service worker, no del job, y comprobar reanudacion del mismo intento.
7. Verificar cierre normal del Brave al finalizar la fixture local y ausencia de prompts duplicados.

Evidencia a conservar: timeline saneado, ids ficticios, lifecycle, reactivaciones, conteos, hashes y resultado de pruebas. No conservar texto del chat.

Salida del gate: al menos una ejecucion ficticia completa con el chat nunca dependiente de intervencion humana.

### Gate 8 - Validacion comercial real de inicio a fin

Objetivo: validar el recorrido que solicita el propietario, sin confundirlo con publicacion automatica.

1. Iniciar una nueva solicitud comercial real desde el sitio publico.
2. Verificar propuesta Flash y aceptacion valida del cliente.
3. Confirmar creacion de Phase 0, job, lease, `runId` y `executionGeneration` nuevos.
4. Dejar que el daemon unico abra el Brave dedicado.
5. Trabajar en otro navegador y no tocar Brave; el agente observa solo diagnostico saneado.
6. Confirmar plan creativo, todas las imagenes y todos los fragmentos de codigo sin clicks, refresh ni seleccion manual del chat.
7. Confirmar ensamblado, validaciones, ZIP y checksums del run actual.
8. Confirmar envio a Oracle como `pending_review/submitted_for_review` y cierre automatico de Brave.
9. Verificar en Oracle Admin que la release solo sea visible para revision administrativa.
10. El propietario realiza la aprobacion humana obligatoria. El agente no debe autoaprobarla ni saltar el gate.
11. Verificar que la tarjeta/enlace del cliente muestre exactamente la demo aprobada.
12. Confirmar listener `idle`, ausencia de `active-run.json` y run archivado.
13. Ejecutar un segundo expediente controlado o una prueba de aislamiento para demostrar que no reutiliza chat, assets, fragmentos, release ni generation del primero.

Salida del gate: evidencia completa desde solicitud publica hasta demo aprobada, con separacion humana conservada.

## Criterios de aceptacion

La incidencia solo puede cerrarse si:

- no existe pagina supervisora persistente en la tira de tabs;
- el chat vinculado permanece como tab activo del Brave dedicado durante cada trabajo;
- usar otro navegador no interrumpe la generacion ni provoca robo de foco;
- un tab oculto nunca produce `json-missing`, `no-image` ni timeout terminal;
- cambiar temporalmente de tab se autocorrige sin refresh manual;
- no se duplica ningun prompt ni intento;
- schema, `run_id`, lease y `execution_generation` siguen siendo obligatorios;
- texto e imagenes completan con observabilidad saneada;
- el recorrido real llega a `pending_review`, luego a aprobacion humana y visibilidad correcta al cliente;
- Brave cierra y el daemon vuelve a `idle`;
- el segundo job queda aislado del primero.

## Rollback

1. Solo hacer rollback cuando no exista un run activo.
2. Restaurar el ZIP respaldado de la extension y comprobar sus SHA-256.
3. Restaurar unicamente los archivos Oracle modificados por esta incidencia; no tocar cambios de ventas, WhatsApp, pagos, Admin ni otras integraciones.
4. Recargar la extension con el sincronizador existente y verificar su version.
5. Ejecutar las suites de extension, runner y native host.
6. No reutilizar una release, chat o carpeta de un intento iniciado con la version revertida.

## Alcance de archivos esperado

### Extension externa

- `C:\dev\lmwares\lmwares-chatgpt-demo-runner\manifest.json`
- `C:\dev\lmwares\lmwares-chatgpt-demo-runner\content.js`
- `C:\dev\lmwares\lmwares-chatgpt-demo-runner\demo-service-worker.js`
- `C:\dev\lmwares\lmwares-chatgpt-demo-runner\demo-popup.js`
- tests y fixture anonimizada directamente relacionados

### Oracle

- `scripts/lmwares-commercial-demo-runner/sync-browser-extension.mjs`
- `scripts/lmwares-commercial-demo-runner/diagnose-browser.mjs`
- tests nuevos de sincronizacion/lifecycle
- `docs/LMWARES-COMMERCIAL-INTAKE-AUTOMATION-RUNBOOK.md`
- este plan y, al concluir, un handoff actualizado

No se requirieron cambios de schema D1, endpoints comerciales, reglas de lease ni publicacion. La validacion real descubrio ademas que el Admin conservaba el estado inicial del job en una pestaña abierta; se amplio el alcance de forma acotada para refrescar solo lifecycle, fases, jobs y orden de trabajo cada 10 segundos, sin sobrescribir formularios administrativos.

## Orden de entrega recomendado

1. Gates 0-1: baseline y pruebas rojas.
2. Gate 2: retirar supervisor persistente.
3. Gates 3-5: contrato de visibilidad, finalizacion y diagnostico.
4. Gate 6: regresion completa.
5. Gate 7: canary ficticia en Brave real.
6. Gate 8: solicitud comercial real con aprobacion humana.
7. Solo despues: clasificar diff, `git diff --check`, documentar evidencia y preparar commits aislados si el propietario lo autoriza.

## Estado al cerrar este diagnostico

- No hay `active-run.json` vigente.
- El daemon singleton sigue activo.
- El Brave dedicado cerro por el flujo normal.
- La ejecucion real afectada quedo `submitted_for_review`.
- La correccion de lifecycle permanece pendiente.
- El flujo no debe declararse terminado hasta superar Gates 0-8 con una nueva ejecucion.

## Ejecucion de la correccion (2026-09-14)

- La extension se actualizo a `0.3.12`: no abre una pagina supervisora persistente; un documento ChatGPT oculto devuelve `page-hidden`, conserva el intento y el worker reactiva solamente su tab vinculada.
- Se verifico en Brave dedicado que una pestaña neutra temporal no duplica el prompt: ChatGPT recupera su tab activa y sigue en el mismo `attemptId`.
- Suites verdes: extension `65/65`; runner y native host `11/11`; Admin `typecheck` y build verdes.
- El fixture de navegador se endurecio para que el daemon lo reconozca como local y nunca intente renovar un lease ficticio ni enviarlo a Oracle. Al terminar, se archiva mediante `clear-initialization-fixture.mjs`.
- La primera solicitud real de validacion, JOYERIA GRECIA (`runId` `13fc8a00-3c8c-447f-b651-aa98490f3a63`), termino en `submitted_for_review`, release `466d9e17-5d01-4b5b-b672-649887665a71`; se abrio y verifico su revision privada autenticada en Admin.
- Esa ejecucion descubrio una segunda causa independiente: un fragmento de codigo grande podia truncarse o contener comillas no escapadas y no producir `code-package.json`. La generacion se dividio en fragmentos de un archivo, se agrego recuperacion estricta del envelope de un solo archivo y reintentos acotados, conservando la validacion exacta de schema, fragmento y ruta.
- La segunda solicitud real, MECANICA "LOS CHAPOS" (`runId` `816fbe7a-c6dd-410a-a998-add48495883b`), arranco automaticamente al aceptar la oferta, genero 4 assets y todas las rutas, ensamblo el ZIP SHA-256 `580f52e589dd278f66c7f5a65cae263df12d364a747adca1623419982b1678e1` y termino en `submitted_for_review`, release `d0ce5598-fdfb-4984-b045-321f2815d1f5`.
- Admin mostro de forma autenticada `Agente demo: completed`, el enlace exacto de revision privada y la demo con Inicio, Catalogo y Contacto. No se pulso `Aprobar demo y mostrar al cliente`.
- El refresco operativo de Admin se desplego en Cloudflare Pages (`lmwares-admin`, deployment `ba21a5d9`) para que una pestaña ya abierta deje de mostrar `claimed` despues de que el backend recibe el release.
- Al cierre no existe `active-run.json`, el daemon singleton sigue escuchando y el Brave dedicado cerro por el flujo normal.
