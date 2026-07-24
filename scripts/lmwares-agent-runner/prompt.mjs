export function buildAgentPrompt({ project, task, operation, baseRevision }) {
  const criteria = task.criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n');
  const files = task.sourceFiles?.length
    ? task.sourceFiles.map((file) => `- ${file}`).join('\n')
    : '- Descúbrelos antes de actuar.';
  const visualSequence = task.visualFrames?.length
    ? task.visualFrames
        .map((frame, index) => {
          const frameCriteria = frame.criteria
            .map((criterion) => `   - ${criterion}`)
            .join('\n');
          return `${index + 1}. ${frame.title} [${frame.id}] — imagen adjunta ${index + 1}
   Objetivo: ${frame.objective}
   Entrada: ${frame.trigger}
   Transición: ${frame.transition || 'estado inicial'}
   Duración: ${frame.durationMs} ms
${frameCriteria}`;
        })
        .join('\n')
    : 'Una sola imagen objetivo sin secuencia.';

  if (operation === 'discover') {
    return `Eres el agente de descubrimiento visual de LMWARES Oracle.

Proyecto: ${project.name}
Repositorio autorizado: ${project.projectId}
Revisión base: ${baseRevision}

Objetivo:
Inspecciona todo el monorepo y construye un inventario semántico de las pantallas visuales reales que Oracle debe mostrar. No implementes cambios y no modifiques ningún archivo.

Reglas obligatorias:
- Lee y cumple AGENTS.md antes de inspeccionar el código.
- Trabaja solo en este checkout y conserva el sandbox de solo lectura.
- No generes código, no hagas commits, no cambies ramas y no uses subagentes.
- Inspecciona las rutas activas de apps/public-web y apps/admin-web, sus páginas y componentes principales.
- Empieza por los archivos App.tsx de rutas y usa búsquedas dirigidas con rg; evita leer dependencias, builds o archivos irrelevantes.
- Excluye rutas que únicamente redirigen, placeholders sin superficie propia, APIs, Workers y módulos compartidos no visuales.
- Una pantalla puede ser una página completa o un estado visual importante de un flujo.
- Usa ids cortos y estables en kebab-case.
- sourceFiles debe contener rutas relativas existentes y relacionadas directamente con la pantalla.
- objective explica qué debe conseguir visualmente esa pantalla, no una tarea técnica.
- criteria contiene criterios observables y concretos.
- Devuelve únicamente el objeto JSON solicitado por el esquema de salida.
`;
  }

  return `Eres un agente de implementación visual lanzado por LMWARES Oracle.

Proyecto: ${project.name}
Pantalla: ${task.title}
Ruta: ${task.route}
Revisión base: ${baseRevision}

Objetivo aprobado:
${task.objective}

Criterios de aceptación:
${criteria}

Archivos inicialmente relacionados:
${files}

Secuencia visual aprobada:
${visualSequence}

Reglas obligatorias:
- Lee y cumple AGENTS.md antes de modificar código.
- Confirma que este checkout conserva la forma actual del monorepo.
- Resuelve únicamente esta pantalla. No amplíes el alcance y no uses subagentes.
- Las imágenes adjuntas son objetivos visuales aprobados, nunca capturas del estado actual.
- Usa cada objetivo adjunto como contrato visual principal y llévalo al código funcional existente.
- Si existe una secuencia, implementa todos sus fotogramas dentro de esta misma tarea y respeta orden, disparador, transición y duración.
- Conserva una alternativa estable para prefers-reduced-motion cuando haya movimiento automático.
- Conserva integraciones, datos y componentes funcionales existentes salvo que el objetivo exija cambiarlos.
- No modifiques secretos, despliegues, migraciones remotas ni datos reales.
- No cambies de rama, no hagas merge, no hagas push y no abras pull requests.
- Ejecuta las validaciones pertinentes para los archivos que cambies.
- Deja los cambios en el worktree y termina con un resumen conciso: archivos, validaciones y riesgos pendientes.
`;
}
