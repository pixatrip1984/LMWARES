# Ejecutor local de agentes LMWARES

Estado: v1 local, autorizado por proyecto y separado del Worker remoto.

## Propósito

Oracle convierte pantallas visuales aprobadas en paquetes de trabajo y ejecuta
un proceso de Codex CLI por pantalla. Cada implementación recibe una rama y un
worktree independientes nacidos de la misma revisión base. El descubrimiento
usa un worktree detached y sandbox de solo lectura.

El ejecutor existe únicamente durante `vite dev` o al invocar su CLI local. No
se incluye en el build, no se expone desde Cloudflare y no acepta comandos
arbitrarios del navegador.

## Contrato de ejecución

- `discover`: un agente, sandbox `read-only`, salida JSON validada por esquema.
- `implement`: entre uno y ocho agentes, sandbox `workspace-write`.
- Cada lote usa una revisión `baseRef` fijada por política.
- Cada tarea obtiene un worktree y, para implementación, una rama `oracle/*`.
- Los agentes no hacen merge, push, deploy ni abren pull requests.
- Oracle captura JSONL, thread id, uso, salida final, estado Git y archivos cambiados.
- Los lotes y evidencias quedan en `.lmwares/agent-runs/`.
- Los worktrees quedan en `.lmwares/worktrees/` para revisión posterior.

## Seguridad

- El repo debe aparecer en el escaneo y coincidir con la política local.
- `origin`, base Git y forma mínima del monorepo se verifican antes de crear worktrees.
- La política autoriza operaciones y paralelismo por proyecto.
- El navegador solo transmite paquetes estructurados; nunca ejecutables o comandos.
- Las mutaciones HTTP exigen loopback, origen exacto, JSON y `X-Lmwares-Agents: 1`.
- `codex exec` usa `approval_policy="never"` con sandbox explícito.
- En Windows se fuerza el sandbox `unelevated`; si Codex reporta que no pudo
  levantarlo, las tareas de implementación se bloquean antes de aceptar cambios.
- Solo se hereda un conjunto mínimo de variables de entorno. Las credenciales
  guardadas de Codex se resuelven desde el perfil local; no se copian claves a evidencias.
- Las imágenes adjuntas deben estar dentro de `.lmwares/designs/`.

## Autorizar un proyecto

```powershell
Copy-Item config/lmwares-agent-policy.example.json .lmwares/agent-policy.local.json
```

La política local debe fijar `repo`, `expectedRemote`, `baseRef`, rutas
obligatorias, operaciones y `maxParallel`. Un archivo dentro del proyecto no
puede concederse permisos a sí mismo.

## Operación

```powershell
npm run lmwares:scan
npm run lmwares:agents:doctor -- shynolaser.mx
npm run lmwares:agents:discover -- shynolaser.mx
npm run lmwares:agents:status -- shynolaser.mx
npm run lmwares:agents:launch -- shynolaser.mx packet.json
npm run lmwares:agents:test
```

`packet.json` contiene `mode: "implement"` y una lista `tasks`. Cada tarea
incluye id, título, ruta, objetivo, criterios, archivos relacionados e imágenes
objetivo autorizadas.

## Capturas visuales reales

Las sesiones locales de navegador guardan las capturas verificadas en
`.lmwares/designs/<projectId>/captures/current/`. Un manifiesto relaciona cada
archivo con el id de pantalla descubierto, su ruta y sus dimensiones. Oracle
las sirve únicamente desde Vite local y adjunta la ruta del archivo al paquete
del agente cuando la pantalla es aprobada.

`Recapturar` abre la ruta mediante Chrome o Edge local, inmoviliza animaciones y
compone las secciones principales en una imagen vertical. Así las páginas largas
no se reducen al primer viewport ni repiten cabeceras o paneles `sticky`. Las
capturas se versionan también por fotograma; los estados interactivos conservan
una imagen independiente. `LMWARES_BROWSER_EXECUTABLE` permite fijar manualmente
el ejecutable del navegador cuando no está en una ruta estándar de Windows.

Si un estado requiere crear datos de prueba —por ejemplo una solicitud enviada
o un drop secreto existente— Oracle lo muestra como `Sin captura real`; no lo
reemplaza por una composición sintética.

## Límites de v1

- Todavía no existe cola de merge, push ni creación automática de pull request.
- Reiniciar Vite marca procesos que estaban activos como interrumpidos; no intenta
  reapropiarse de procesos huérfanos.
- La cancelación termina el árbol local, pero los worktrees se conservan.
- El aislamiento es adecuado para repos locales confiables. Código multiusuario
  o de terceros requiere un sandbox de sistema o contenedor dedicado.
