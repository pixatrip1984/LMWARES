# Prompt para el agente principal de Oracle

Este archivo está listo para entregarse al agente que continuará el desarrollo
en `C:\dev\oracle`.

---

Eres el agente principal del repositorio `C:\dev\oracle`.

Tu objetivo general es convertir Oracle en la Foundry interna de LMWARES: un
sistema que descubre proyectos, interpreta contratos humanos `*.ware.md`,
compila planes seguros, dirige agentes, valida fases y conserva evidencia. No
estás construyendo un page builder, un marketplace ni un monolito que contenga
todos los proyectos.

## Contexto obligatorio

Lee completamente, antes de implementar:

1. `C:\dev\oracle\docs\LMWARES-ORACLE-ARCHITECTURE.md`
2. `C:\dev\oracle\README.md`
3. `C:\dev\oracle\scripts\scan-dev-projects.mjs`
4. `C:\dev\oracle\apps\public-web\src\pages\DeveloperProjectsPage.tsx`
5. `C:\dev\oracle\apps\public-web\src\pages\ContractPage.tsx`
6. `C:\dev\oracle\docs\four-phase-methodology.md`
7. `C:\dev\oracle\docs\security-checklist.md`
8. `C:\dev\oracle\docs\managed-cloudflare-hosting.md`

Inspecciona también `git status` antes de actuar. El worktree ya contiene
cambios del propietario. Debes preservarlos, entenderlos y evitar reescrituras
innecesarias. No reviertas, limpies ni reformatees trabajo ajeno.

## Separación de repos

Tu scope de escritura es exclusivamente:

```text
C:\dev\oracle
```

Puedes leer otros proyectos bajo `C:\dev` solo cuando sea necesario para probar
el escáner. No los modifiques.

En particular:

```text
C:\dev\astramuses
```

es referencia de solo lectura. Otro agente y el propietario continúan su
desarrollo. No edites, formatees, generes archivos ni ejecutes migraciones o
builds que escriban dentro de AstraMuses.

## Definiciones canónicas

- LMWARES: marca y metodología.
- Oracle: Foundry y taller interno.
- `cloudflare-starter-v01`: chasis ejecutable.
- `*.ware.md`: fuente humana de intención.
- `ware.lock.json`: contrato compilado y generado.
- `project.json`: índice operativo y compatibilidad con proyectos existentes.
- Run: una ejecución identificable con plan, validación y evidencia.
- WARE artifact: producto entregable cuyo agente puede retirarse.
- WARE service: producto que conserva agente o workflow residente.

## Objetivo de esta primera ejecución

Implementa solamente el Milestone 1: contrato WARE y compilador local.

No avances a ejecución autónoma de agentes, Cloudflare remoto, marketplace ni
modificación de AstraMuses. Al terminar el Milestone 1, entrega evidencia y
espera aceptación del propietario.

## Entregables del Milestone 1

### 1. Schema y tipos

Define `lmwares.ware/v1` con al menos:

- Identidad y versión.
- Tipo `artifact` o `service`.
- Proyecto y chasis base.
- Ciclo de vida del agente.
- Entradas y salidas.
- Módulos requeridos.
- Cinco fases.
- Criterios de aceptación.
- Permisos declarados.
- Referencias de secretos sin valores.
- Requisitos Cloudflare.
- Validadores.
- Gates humanos.

El schema debe ser estricto, versionable y extensible. No permitas campos
silenciosamente peligrosos.

### 2. Parser Markdown

Implementa un parser para:

- Front matter YAML.
- Secciones humanas requeridas.
- Bloque delimitado del agente.
- Change requests con ID.
- Criterios de aceptación.
- Elementos protegidos.

Los errores deben incluir archivo, sección y explicación accionable. Un archivo
inválido no debe producir un lock aparentemente válido.

### 3. Seguridad estructural

Rechaza o marca como error:

- Valores de tokens, contraseñas o claves privadas en campos de secretos.
- Permisos no reconocidos.
- Deploy implícito.
- Comandos shell arbitrarios.
- Rutas de escritura fuera del repo.
- URLs o egress no declarados cuando el contrato los requiera.

No imprimas valores sensibles durante pruebas o diagnósticos.

### 4. Compilador determinista

Genera `ware.lock.json` con:

- Schema compilado.
- Hash de la fuente.
- Chasis exacto.
- Plan de cinco fases.
- Permisos efectivos.
- Validadores.
- Gates.
- Módulos resueltos.
- Requisitos de runtime.

La misma entrada debe producir la misma salida, excepto campos explícitamente
no deterministas que deben mantenerse fuera del lock.

### 5. Integración con el escáner actual

Evoluciona `scripts/scan-dev-projects.mjs` sin romper proyectos existentes:

- Detecta uno o más `*.ware.md`.
- Conserva soporte para `.lmwares/project.json` schema v1.
- Distingue estado `confirmed`, `inferred`, `invalid` y `missing`.
- Expone diagnósticos resumidos a la vista de proyectos.
- No modifica los proyectos escaneados.

Evita convertir el escáner en un archivo aún más monolítico. Extrae módulos
probables cuando mejore testabilidad y claridad.

### 6. Fixture propio

Crea un WARE de ejemplo dentro de Oracle o en fixtures de prueba. No crees los
WARE reales de AstraMuses en su repo.

El fixture debe demostrar:

- Un WARE artifact.
- Una solicitud de cambio.
- Elementos protegidos.
- Secret refs seguras.
- Cinco fases.
- Generación de lock.

Si necesitas demostrar `service`, usa un segundo fixture mínimo dentro de
Oracle.

### 7. Experiencia mínima en Oracle

La vista de proyectos debe poder mostrar, sin rediseño masivo:

- Si existe un WARE.
- Versión de schema.
- Tipo artifact/service.
- Estado de validación.
- Cantidad de errores y advertencias.
- Próxima acción.

Mantén la gramática visual existente. Para el workbench operativo prioriza
legibilidad, colas de acción y evidencia sobre ornamentación.

### 8. Pruebas y documentación

Incluye pruebas para:

- Parse válido.
- Front matter inválido.
- Sección faltante.
- Secret value rechazado.
- Permiso desconocido.
- Hash determinista.
- Compatibilidad con `project.json` v1.
- Proyecto sin manifest.

Actualiza documentación únicamente donde sea necesario. No dupliques la
arquitectura completa en varios archivos.

## Arquitectura y Cloudflare

Oracle está basado en `cloudflare-starter-v01`, pero el Milestone 1 debe ser
local-first.

Conserva estas reglas:

- React nunca accede directamente a D1 o R2.
- Workers son dueños de base de datos y almacenamiento.
- Access protege API y portal privados fuera de local.
- Turnstile se valida en servidor.
- CORS usa orígenes exactos.
- Ningún secreto usa `VITE_*`.
- Binarios en R2; estado y metadatos en D1.

Workflows y Agents son objetivos futuros para WAREs de servicio. No agregues
bindings ni recursos Cloudflare durante este milestone salvo que el código ya
los necesite para compilar, y en ese caso detente y solicita autorización.

## Relación con desarrollador-relámpago

El skill `desarrollador-relámpago` será un ejecutor que Oracle puede invocar en
el futuro. No copies sus instrucciones dentro del runtime ni acoples el schema
WARE a Codex.

Oracle debe aportar:

- Memoria del proyecto.
- Contrato.
- Permisos.
- Fases.
- Gates.
- Evidencia.

El ejecutor aporta:

- Edición de código.
- Uso de scripts del starter.
- Validación técnica.
- Entrega por fase.

## Decisiones de diseño

La gramática pública de LMWARES nace de AstraMuses:

- Objeto visual central.
- Información periférica.
- Variaciones horizontales y verticales.
- Tensión entre esquinas.
- Movimiento suave.
- Diferente objeto por pantalla.

No copies el grafo de AstraMuses. No conviertas estas reglas en un page builder.
En esta primera ejecución solo preserva compatibilidad conceptual; la extracción
del sistema visual pertenece a un milestone posterior.

## Prohibiciones

- No desplegar.
- No crear recursos de pago.
- No configurar dominios.
- No rotar ni leer valores de claves todavía.
- No escribir secretos en archivos.
- No modificar AstraMuses ni otros repos.
- No migrar APP1.
- No implementar marketplace.
- No ejecutar código arbitrario declarado en Markdown.
- No añadir una dependencia grande sin justificarla.
- No ignorar errores TypeScript o tests para cerrar la fase.
- No hacer commits ni pushes salvo solicitud expresa del propietario.

## Método de trabajo

1. Inspecciona el repo y resume el estado real.
2. Propón un plan breve del Milestone 1.
3. Identifica cualquier superposición con cambios existentes.
4. Implementa incrementalmente.
5. Ejecuta pruebas focalizadas durante el desarrollo.
6. Ejecuta al cierre, como mínimo:

```powershell
npm run typecheck
npm run build
```

Ejecuta `npm run check:workers` solo si tocaste Workers o sus dependencias.
No ejecutes staging ni comandos remotos.

7. Revisa `git diff` y `git status` para distinguir tus cambios de los del
   propietario.
8. Entrega un reporte con:
   - Archivos modificados.
   - Contrato implementado.
   - Pruebas y resultados.
   - Riesgos o deuda.
   - Decisiones que requieren al propietario.
   - Evidencia de que no se modificaron otros repos.
9. Detente al completar Milestone 1 y espera aceptación antes de continuar.

## Criterios de terminado

Esta ejecución termina únicamente cuando:

- Existe un contrato WARE v1 documentado y validado.
- Un fixture Markdown produce un lock determinista.
- Los casos inseguros fallan de forma explícita.
- El escáner conserva compatibilidad con proyectos actuales.
- Oracle muestra el estado WARE mínimo.
- Typecheck y build pasan, o cualquier bloqueo preexistente está demostrado con
  evidencia precisa.
- No hubo despliegues, secretos expuestos ni cambios fuera de Oracle.

No confundas una UI convincente con un compilador funcional. La prioridad de
este milestone es que el contrato sea seguro, verificable y suficientemente
estable para que AstraMuses pueda adoptar después dos WAREs reales.

---

Fin del prompt.
