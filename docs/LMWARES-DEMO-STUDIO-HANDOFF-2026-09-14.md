# Handoff operativo — LMWares Demo Studio

Fecha: 2026-09-14  
Estado: **bloqueado en una prueba comercial real; no considerar el flujo terminado.**

## Objetivo de la siguiente sesión

Resolver de raíz la lectura y validación de la respuesta estructurada de ChatGPT para que una solicitud comercial real complete este recorrido sin intervención manual:

```text
solicitud pública
→ propuesta de DeepSeek Flash
→ aceptación válida del cliente
→ job Phase 0 en Oracle
→ runner local único
→ Brave dedicado + extensión privada
→ plan creativo / imágenes / código
→ ensamblado y validación local
→ release pendiente de revisión en Oracle Admin
→ aprobación humana
→ demo visible al cliente
```

No marcar ninguna fase como terminada, no enviar una release ficticia y no publicar nada para ocultar el fallo actual.

## Bloqueo actual, reproducible

La última solicitud comercial sí llegó hasta la automatización después de que el cliente aceptó la propuesta. El runner creó el proyecto local y abrió el flujo de ChatGPT. La extensión terminó en:

```text
La respuesta no contiene JSON parseable.
```

Estado local observado al redactar este handoff:

```json
{
  "runId": "6aed7950-9462-4e9e-bb6b-37cf2e753dd3",
  "jobId": "9403fa39-e2ad-4736-84ff-fd11366b2db0",
  "status": "awaiting_chat",
  "studioStatus": "attention",
  "studioMessage": "La respuesta no contiene JSON parseable.",
  "projectPath": "C:\\dev\\lmwares-demos\\tamales-juana",
  "executionGeneration": 1,
  "updatedAt": "2026-09-14T18:28:14.439Z"
}
```

El error se origina en la extensión privada, concretamente en `validateStructuredPost()` de:

```text
C:\dev\lmwares\lmwares-chatgpt-demo-runner\demo-studio-core.js
```

La función llama a `extractJsonCandidate()`. Actualmente reconoce un bloque Markdown ` ```json `, un documento JSON completo o el primer objeto balanceado dentro de `innerText`. El mensaje significa que ninguno de esos caminos produjo un objeto que `JSON.parse()` acepte. No implica por sí solo que Oracle, la cola o el lease hayan fallado.

## Evidencia de que no se debe rediseñar todo

Una ejecución anterior de prueba técnica completó ensamblado local correctamente: cuatro rutas, cuatro imágenes locales, checksums, `robots.txt`, metadatos/cabeceras `noindex`, manifiesto de rutas derivado por Oracle, ZIP y release pendiente de revisión. Aquella prueba no debía enviarse a Oracle, por lo que no sustituye esta prueba comercial real.

También existe una ejecución comercial recuperada que llegó a `submitted_for_review` y cerró el Brave dedicado. Eso confirma partes del runner, pero **no valida la nueva ejecución que ahora está bloqueada en el parser**.

## Arquitectura que se debe preservar

- Oracle conserva la autoridad comercial y el lifecycle.
- `DemoBuildSpec v1` es el snapshot inmutable del contexto de demo.
- La cola remota y su lease son autoritativos; el runner nunca inventa una finalización.
- `runId`, `lease_token` y `execution_generation` protegen contra runners o resultados obsoletos.
- ChatGPT no genera `route-manifest.json`, evidencia reservada ni decisiones de lifecycle.
- El ensamblador local genera los artefactos reservados y valida rutas, assets locales, checksums, `noindex` y estructura de release.
- La release llega primero a Oracle Admin como pendiente de revisión; la aprobación humana es la que permite mostrarla al cliente.
- Phase 1 no empieza hasta que Phase 0 esté aprobada y el pago requerido esté confirmado por Mercado Pago.

## Componentes y ubicaciones relevantes

| Componente | Ubicación | Nota |
| --- | --- | --- |
| Runner / daemon | `scripts/lmwares-commercial-demo-runner/` | Dentro del repositorio Oracle; consulta la cola cada 15 s. |
| Estado de ejecución local | `C:\dev\lmwares-demos\control\active-run.json` | No editar ni borrar mientras haya un job activo. |
| Proyectos generados | `C:\dev\lmwares-demos\<slug>` | En este caso `tamales-juana`. |
| Lock del daemon | `C:\dev\lmwares-demos\control\daemon.lock` | Debe existir un único daemon. |
| Extensión privada | `C:\dev\lmwares\lmwares-chatgpt-demo-runner` | Fuera del Git de Oracle; un commit de Oracle **no la incluye**. |
| Native host | `scripts/lmwares-demo-native-host/` | Puente entre extensión y control local. |
| Lanzador Brave | `scripts/lmwares-commercial-demo-runner/start-brave-demo-studio.ps1` | Perfil dedicado, no el navegador personal. |
| Sincronizador de extensión | `scripts/lmwares-commercial-demo-runner/sync-browser-extension.mjs` | Recarga la extensión unpacked vía CDP. |
| Diagnóstico navegador | `scripts/lmwares-commercial-demo-runner/diagnose-browser.mjs` | Debe usarse sin imprimir contenido sensible del chat. |
| Runbook existente | `docs/LMWARES-COMMERCIAL-INTAKE-AUTOMATION-RUNBOOK.md` | Útil como referencia, pero contiene secciones históricas; este handoff prevalece para el bloqueo actual. |

## Comportamiento instalado del listener

- El daemon usa un lock atómico; una segunda instancia sale en vez de competir por el job.
- El supervisor oculto se instala por el acceso directo de inicio de Windows y despierta/reinicia el daemon cuando haga falta.
- El daemon queda `idle` sin trabajo; al recibir un job comercial válido reclama uno, abre el Brave dedicado y espera el flujo de ChatGPT.
- El navegador usa el perfil dedicado `C:\dev\lmwares-demo-brave-profile` y la extensión con ID `onnphmgblmlnecgmnknbhgflibbpckln`.
- La extensión intenta inicializar y continuar automáticamente; el popup es un supervisor privado, no un paso que el cliente deba ver ni operar.
- Una vez que una release se entrega para revisión, el runner debe cerrar el Brave dedicado y volver a esperar trabajo.

## Diagnóstico obligatorio antes de cambiar código

Ejecutar desde `C:\dev\oracle`. Todos los comandos deben conservar el prefijo `rtk`.

1. Confirmar el estado local, sin editarlo:

```powershell
rtk node -e "const fs=require('fs');const p='C:/dev/lmwares-demos/control/active-run.json';if(!fs.existsSync(p)){console.log('NO_ACTIVE_RUN')}else{const j=JSON.parse(fs.readFileSync(p,'utf8'));console.log(JSON.stringify({runId:j.runId,jobId:j.jobId,status:j.status,studioStatus:j.studioStatus,studioMessage:j.studioMessage,projectPath:j.projectPath,executionGeneration:j.executionGeneration,updatedAt:j.updatedAt},null,2))}"
```

2. Confirmar que hay exactamente un daemon y que no se trata de un problema de dos runners:

```powershell
rtk powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'lmwares-commercial-demo-runner.*daemon\\.mjs' } | Select-Object ProcessId,CommandLine"
```

3. Ejecutar el diagnóstico estructural del navegador. No pegar ni guardar el texto completo de la conversación del cliente:

```powershell
rtk node scripts/lmwares-commercial-demo-runner/diagnose-browser.mjs
```

4. Localizar la llamada exacta que emitió `json-missing`, y determinar el contrato esperado en ese instante: `creative-plan`, `code-fragment` o `code-package`.

```powershell
rtk rg -n -C 10 --glob "*.js" --glob "*.cjs" "validateStructuredPost|extractJsonCandidate|json-missing|creative-plan|code-fragment|code-package" "C:\dev\lmwares\lmwares-chatgpt-demo-runner"
```

5. Inspeccionar la forma DOM y metadatos de la última respuesta del chat, no su contenido privado completo. Si falta observabilidad, añadir una salida saneada que incluya solamente: contrato esperado, `runId` esperado, longitud, hash estable, número de bloques detectados, etiquetas de bloque y resultado de cada extractor. Nunca registrar prompts, intake, correo, precios ni texto íntegro del cliente.

## Hipótesis a comprobar (no asumir)

1. ChatGPT pudo responder con prosa, varios bloques, un bloque etiquetado de forma distinta, contenido plegado o caracteres invisibles que el extractor actual no reconoce.
2. El content script pudo leer una respuesta parcial, un bloque de UI distinto o la respuesta anterior en vez de la respuesta anclada al prompt actual.
3. El contrato esperado pudo ser `code-fragment`/`code-package`, mientras ChatGPT devolvió un plan creativo o una respuesta de rechazo.
4. El modelo en modo Alta pudo cambiar la presentación DOM/Markdown respecto a la fixture usada para Instantánea.
5. La respuesta pudo estar truncada visualmente o todavía generándose cuando el lector intentó validarla.

La solución no debe "arreglar" JSON corrupto ni aceptar cualquier objeto. Debe identificar de manera determinista la respuesta final correspondiente al prompt y extraer solamente un objeto JSON completo que satisfaga el schema y el `run_id` esperados.

## Estrategia de corrección exigida

1. Reproducir la forma de respuesta fallida con una fixture **anonimizada**. No copiar contenido comercial real al repositorio.
2. Instrumentar el parser con observabilidad mínima y segura para saber qué extractor falló y qué contrato esperaba.
3. Mejorar `extractJsonCandidate()` o el lector DOM de forma acotada:
   - recorrer todos los candidatos razonables, no sólo el primer objeto balanceado fallido;
   - soportar Markdown/DOM real de ChatGPT si la evidencia lo demuestra;
   - esperar respuesta finalizada cuando la UI indique que sigue generándose;
   - seleccionar por schema y `run_id`, no por posición visual;
   - mantener los límites de tamaño y validaciones de archivos/rutas existentes.
4. Añadir un test de regresión para la forma concreta que falló y preservar los tests de bloques JSON previos.
5. Ejecutar la suite de extensión:

```powershell
rtk node --test "C:\dev\lmwares\lmwares-chatgpt-demo-runner\csv-core.test.cjs" "C:\dev\lmwares\lmwares-chatgpt-demo-runner\demo-bootstrap.test.cjs" "C:\dev\lmwares\lmwares-chatgpt-demo-runner\demo-studio-core.test.cjs" "C:\dev\lmwares\lmwares-chatgpt-demo-runner\extension-contract.test.cjs" "C:\dev\lmwares\lmwares-chatgpt-demo-runner\runner-core.test.cjs"
```

6. Ejecutar también las pruebas del runner/native host:

```powershell
rtk node --test scripts/lmwares-commercial-demo-runner/*.test.mjs scripts/lmwares-demo-native-host/*.test.mjs
```

7. Sólo después de una corrección contenida, reiniciar el Brave dedicado a través del lanzador/sincronizador existente para cargar la nueva extensión. No usar el perfil personal de Brave ni Chrome.

8. Retomar o reintentar únicamente mediante el mecanismo seguro del job existente. Antes de hacerlo, verificar que el `runId`, lease y generación siguen siendo actuales. Si expiró el lease, permitir la recuperación normal del runner; no reusar artefactos de otra ejecución.

## Prohibiciones operativas

- No editar, borrar ni fabricar `active-run.json`.
- No limpiar `C:\dev\lmwares-demos\control` para “desatorar” el flujo.
- No marcar el job como completado ni mandar una release a Oracle manualmente.
- No aprobar/publicar la demo como sustituto de una ejecución válida.
- No exponer el contenido completo del chat, correos, intake, importes, claves, tokens ni `lease_token` en logs, commits o documentos.
- No iniciar dos daemon listeners.
- No recargar/eliminar indiscriminadamente el almacenamiento de la extensión si hay un run activo.
- No hacer `git reset --hard`, `git checkout --`, `git clean`, `git add .` ni commit de todo el árbol.

## Higiene del repositorio

El árbol de trabajo está ampliamente modificado y contiene trabajo ajeno posible de la integración de WhatsApp. Al redactar este documento había modificaciones en `apps/`, `workers/`, `packages/`, `scripts/`, migraciones y documentos, además de múltiples archivos no rastreados.

Para cualquier commit futuro:

1. clasificar el diff por autor/objetivo;
2. aislar sólo los archivos directamente corregidos para Demo Studio;
3. recordar que la extensión está fuera de `C:\dev\oracle` y necesita su propia estrategia de versionado/entrega;
4. ejecutar `rtk git diff --check` y las pruebas pertinentes;
5. no desplegar hasta que el flujo real llegue de forma verificable a Oracle Admin pendiente de revisión.

## Criterio de salida de esta incidencia

La corrección estará terminada únicamente si una nueva solicitud comercial real consigue, sin clicks manuales en el popup:

1. propuesta Flash y aceptación del cliente;
2. creación de Phase 0 y del job;
3. arranque automático de un único runner y Brave dedicado;
4. lectura correcta de plan creativo, imágenes y fragmentos/paquete de código en el modelo soportado;
5. ensamblado local transaccional con las validaciones existentes;
6. envío de release a Oracle como `pending_review`;
7. aparición exclusiva en Oracle Admin hasta aprobación humana;
8. al aprobar, actualización de la tarjeta/enlace del cliente a la demo correcta;
9. cierre del navegador dedicado y retorno del listener a `idle`;
10. evidencia de que un segundo job no puede contaminar los artefactos, chat ni resultados del primero.

## Mensaje de arranque recomendado para el siguiente agente

> Continúa desde `docs/LMWARES-DEMO-STUDIO-HANDOFF-2026-09-14.md`. No fuerces ni completes manualmente el job activo. Primero diagnostica por qué la extensión privada emitió `json-missing` para el run `6aed7950-9462-4e9e-bb6b-37cf2e753dd3`, identifica contrato y forma DOM de la respuesta sin exponer información del cliente, añade una fixture anonimizada y una corrección acotada con pruebas. Preserva el lease, la separación Oracle/ChatGPT y el árbol de trabajo ajeno de WhatsApp. Después valida una solicitud comercial real de inicio a fin hasta `pending_review`, no publicación automática.
