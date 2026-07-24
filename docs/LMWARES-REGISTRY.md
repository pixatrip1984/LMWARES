# Registro privado LMWARES

Estado: operativo en desarrollo local.

## Responsabilidades

El registro separa tres piezas:

1. `scripts/scan-dev-projects.mjs` descubre repos sin modificarlos.
2. `.lmwares/cache/dev-projects.json` conserva un cache local ignorado por Git.
3. D1 es el estado canónico del panel privado y conserva proyectos, snapshots,
   validaciones y decisiones de gates.

El cache local solo se expone mediante el middleware de Vite durante `dev`. No
se encuentra bajo `public/`, no se copia a `dist/` y no forma parte del despliegue.

## Flujo local

```powershell
npm run lmwares:scan
npm run db:migrate:local
npm run db:seed:local
npm run dev:local
```

Puertos locales reservados para LMWARES:

```text
Public web  http://127.0.0.1:5273
Admin web   http://127.0.0.1:5274/projects
Public API  http://127.0.0.1:8887
Admin API   http://127.0.0.1:8888
```

Al abrir `/projects`, el panel intenta leer D1. Si el registro todavía está
vacío o el Admin API no está disponible, puede mostrar el scan local como estado
pendiente. Un usuario con rol de escritura puede sincronizarlo desde la pestaña
`Registro`.

## API privada

Todas estas rutas están bajo el middleware de Cloudflare Access. Sincronizar,
crear snapshots y registrar validaciones requiere rol `owner`, `admin` o
`editor`. Las decisiones de gates requieren `owner` o `admin`.

```text
GET  /admin/projects
GET  /admin/projects/:id
POST /admin/projects/sync
GET  /admin/projects/:id/snapshots
POST /admin/projects/:id/snapshots
GET  /admin/projects/:id/validations
POST /admin/projects/:id/validations
GET  /admin/projects/:id/approvals
POST /admin/projects/:id/approvals
```

El endpoint de sincronización valida tamaños, enums, rutas, URLs, fases y
metadatos antes de escribir. D1 usa prepared statements y una operación batch
para actualizar el inventario.

## Persistencia

- `lmwares_projects`: estado operativo descubierto y confirmado por el panel.
- `lmwares_project_snapshots`: evidencia inmutable asociada a un proyecto.
- `lmwares_validation_results`: resultados técnicos append-only, vinculables a
  un snapshot exacto.
- `lmwares_approvals`: decisiones humanas append-only por gate.
- `audit_events`: sincronizaciones, snapshots, validaciones y aprobaciones.

Los snapshots actuales guardan metadatos, revisión, preview y ruta del artefacto.
Las validaciones registran evidencia ya obtenida; no aceptan ni ejecutan comandos.
Una aprobación de `staging` o `production` exige snapshot y comentario. Ninguna
decisión prepara ni ejecuta recursos Cloudflare.

## Límites actuales

- Es una herramienta interna de un solo espacio de trabajo.
- No está habilitada para aislamiento SaaS multiusuario.
- No crea recursos Cloudflare remotos.
- No ejecuta código ni comandos procedentes de manifests.
- No publica rutas de filesystem en el frontend público.

El aislamiento multiusuario deberá introducir identidad de workspace y
autorización por membresía antes de abrir el producto a terceros; no debe
simularse únicamente con filtros de interfaz.

## Runner local

La pestaña `Control` consulta un runner dev-only con deny-by-default. La política
local enlaza `projectId`, ruta real y validadores permitidos; los manifests de
los proyectos no pueden autoautorizarse. Consulta
`docs/LMWARES-LOCAL-RUNNER.md` para el contrato y los controles.

## Siguiente hito

1. Crear snapshots de preview producidos por Codex.
2. Añadir cancelación y progreso observable a las ejecuciones locales.
3. Recuperar evidencia pendiente cuando D1 no esté disponible.
4. Definir requisitos verificables para cerrar cada gate.
5. Preparar perfiles de staging sin ejecutar deploy hasta recibir aprobación.
