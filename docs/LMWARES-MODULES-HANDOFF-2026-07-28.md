# Handoff de continuidad: módulos LMWares

Fecha del corte: 2026-07-28
Repositorio: `C:\dev\oracle`
Rama: `cloudflare-starter-v01`
HEAD observado: `7acdd84` (`panel terminado`, 2026-07-24)
Estado: implementación local avanzada, sin commit y sin despliegue remoto.

## 1. Resumen ejecutivo

Se implementaron cinco verticales iniciales de módulos LMWares:

1. Blog.
2. Galerías.
3. Docs.
4. Formulario/Solicitudes.
5. Eventos.

Cada módulo ya tiene, en distinto grado:

- modelo de dominio;
- validación de entrada;
- repositorio D1;
- migración D1;
- API administrativa;
- API pública;
- espacio administrativo real;
- componente público reutilizable.

También se creó un `Module Studio` compartido con navegación lateral y el patrón
aprobado para el administrador:

- preview público a la izquierda;
- editor o gestión operativa a la derecha;
- acciones explícitas `Previsualizar`, `Guardar borrador` y `Publicar`;
- identidad de LMWares en el panel, no `TU MARCA AQUÍ`.

La tanda fue dividida entre cinco subagentes independientes y después integrada
por el agente principal. TypeScript, los Workers y las migraciones locales
quedaron coherentes. Todavía no puede considerarse una entrega productiva:
faltan pruebas E2E de escritura, conectar los componentes públicos al constructor
de micrositios y resolver algunos puntos de seguridad/operación descritos abajo.

## 2. Advertencia crítica sobre Git

El worktree está sucio y mezcla varias líneas de trabajo:

- el configurador y preview de paquetes;
- el flujo Free;
- el runner de generación Free;
- los cinco módulos de esta tanda;
- archivos de procesos locales bajo `.codex-dev`.

No existe un commit que contenga los módulos. El último commit sigue siendo
`7acdd84`.

El siguiente agente no debe ejecutar:

- `git add .`;
- un commit masivo;
- `git reset --hard`;
- limpieza de archivos no rastreados;
- un despliegue remoto.

Primero debe revisar `git status --short`, separar el alcance y preservar los
cambios anteriores del usuario. `infra/d1/migrations/0004_lmwares_free_intakes.sql`
pertenece al flujo Free previo; las migraciones `0005` a `0009` pertenecen a los
módulos descritos aquí.

## 3. Decisiones de producto que deben conservarse

### 3.1 Admin real

El admin no es una colección de capturas. Es una interfaz operativa real.

El patrón acordado es:

```text
preview público                  editor/operación
       izquierda        |             derecha
```

No es necesario refrescar el preview por cada tecla. El flujo preferido es:

1. editar;
2. previsualizar;
3. guardar borrador;
4. publicar.

### 3.2 Módulos públicos

Los módulos públicos son secciones insertables en un micrositio vertical. Deben
aparecer sólo cuando el paquete o proyecto los incluya. No se debe construir un
sitio distinto por cada combinación.

### 3.3 Persistencia y archivos

- D1 conserva estructura, metadatos, estados, orden e historial.
- R2 conserva los binarios.
- `file_assets` conecta los objetos de R2 con los registros de negocio.
- Los documentos descargables no deben servirse mediante el proxy genérico
  `/media/<key>`.
- Los álbumes funcionan como categorías públicas efectivas.

## 4. Integración compartida

### 4.1 Navegación administrativa

Archivos principales:

- `apps/admin-web/src/pages/SiteModulesPage.tsx`
- `apps/admin-web/src/pages/siteModulesPage.css`
- `apps/admin-web/src/App.tsx`
- `apps/admin-web/src/pages/ProjectsPage.tsx`

Ruta administrativa:

```text
/projects/:projectId/modules/:moduleKey
```

Claves actualmente admitidas:

```text
blog
galleries
docs
forms
events
```

Desde la ficha de un proyecto se añadió `Abrir módulos`.

### 4.2 Registro de repositorios

`packages/db/src/index.ts` expone:

- `siteBlog`;
- `siteGalleries`;
- `siteDocs`;
- `siteForms`;
- `siteEvents`.

Los modelos y validadores se exportaron desde:

- `packages/domain/src/index.ts`;
- `packages/validation/src/index.ts`;
- `packages/db/src/index.ts`.

### 4.3 Montaje de APIs

Admin API:

```text
/admin/projects/:projectId/modules/blog
/admin/projects/:projectId/modules/galleries
/admin/projects/:projectId/modules/docs
/admin/projects/:projectId/modules/forms
/admin/projects/:projectId/modules/events
```

Public API:

```text
/sites/:projectId/blog
/sites/:projectId/galleries
/sites/:projectId/docs
/sites/:projectId/forms
/sites/:projectId/events
```

Los montajes viven en:

- `workers/admin-api/src/index.ts`;
- `workers/public-api/src/index.ts`.

## 5. Estado por módulo

### 5.1 Blog

Archivos principales:

- `infra/d1/migrations/0005_lmwares_blog_module.sql`
- `packages/domain/src/models/site-blog.ts`
- `packages/validation/src/site-blog.ts`
- `packages/db/src/repositories/site-blog.ts`
- `workers/admin-api/src/routes/site-blog.ts`
- `workers/public-api/src/routes/site-blog.ts`
- `apps/admin-web/src/features/site-modules/blog/BlogWorkspace.tsx`
- `apps/admin-web/src/features/site-modules/blog/blogWorkspace.css`
- `apps/admin-web/src/features/site-modules/blog/blogApi.ts`
- `apps/public-web/src/features/site-modules/blog/BlogPublicModule.tsx`
- `apps/public-web/src/features/site-modules/blog/blogPublicModule.css`

Implementado:

- artículos por proyecto;
- estados `draft`, `published` y `archived`;
- título, slug, categoría, resumen y portada;
- cuerpo mediante bloques o HTML;
- editor administrativo de doble vista;
- listado público y detalle por slug;
- portada enlazada con `file_assets`/R2;
- saneamiento conservador de HTML mediante `HTMLRewriter`;
- eventos de auditoría y control de estado.

Pendiente:

- flujo E2E crear → previsualizar → publicar → abrir públicamente;
- pruebas automatizadas del saneamiento HTML;
- integrar `BlogPublicModule` en el host real de micrositios.

### 5.2 Galerías

Archivos principales:

- `infra/d1/migrations/0006_lmwares_galleries_module.sql`
- `packages/domain/src/models/site-gallery.ts`
- `packages/validation/src/site-gallery.ts`
- `packages/db/src/repositories/site-gallery.ts`
- `workers/admin-api/src/routes/site-gallery.ts`
- `workers/public-api/src/routes/site-gallery.ts`
- `apps/admin-web/src/features/site-modules/galleries/GalleriesWorkspace.tsx`
- `apps/admin-web/src/features/site-modules/galleries/galleriesWorkspace.css`
- `apps/admin-web/src/features/site-modules/galleries/galleriesApi.ts`
- `apps/public-web/src/features/site-modules/galleries/GalleriesPublicModule.tsx`
- `apps/public-web/src/features/site-modules/galleries/galleriesPublicModule.css`

Implementado:

- álbumes como categorías públicas;
- listado y detalle público por slug;
- título, categoría, descripción, portada y orden;
- carga de imágenes a R2;
- relación con `file_assets`;
- JPG, PNG y WebP;
- validaciones de MIME, magic bytes, tamaño y dimensiones;
- SHA-256 de imágenes;
- orden, portada, texto alternativo y eliminación;
- borrador y publicación.

Pendiente:

- pruebas E2E con varios álbumes y reordenamiento;
- probar eliminación y limpieza de R2 ante fallos;
- integrar `GalleriesPublicModule` en el host real de micrositios.

### 5.3 Docs

Archivos principales:

- `infra/d1/migrations/0007_lmwares_docs_module.sql`
- `packages/domain/src/models/site-docs.ts`
- `packages/validation/src/site-docs.ts`
- `packages/db/src/repositories/site-docs.ts`
- `workers/admin-api/src/routes/site-docs.ts`
- `workers/public-api/src/routes/site-docs.ts`
- `apps/admin-web/src/features/site-modules/docs/DocsWorkspace.tsx`
- `apps/admin-web/src/features/site-modules/docs/docsWorkspace.css`
- `apps/admin-web/src/features/site-modules/docs/docsApi.ts`
- `apps/public-web/src/features/site-modules/docs/DocsPublicModule.tsx`
- `apps/public-web/src/features/site-modules/docs/docsPublicModule.css`

Implementado:

- categorías;
- documentos y versiones;
- estado, visibilidad y versión actual;
- claves opacas de R2 bajo el prefijo del proyecto;
- estados de carga `quarantine`, `scanning`, `clean`, `rejected` y publicación;
- validación inmediata de extensión, MIME, contenido y nombre;
- bloqueo de formatos activos o peligrosos;
- preview administrativo limitado;
- listado público descargable;
- descarga mediada por Worker;
- `Content-Disposition`;
- `X-Content-Type-Options: nosniff`;
- `Cache-Control` restrictivo;
- bloqueo del prefijo Docs en el proxy genérico `/media/<key>`.

Pendientes importantes:

1. `processUpload` crea actualmente el `file_asset` con `checksum: null`.
   Debe calcular y persistir SHA-256 antes de declarar completa la protección de
   integridad.
2. Los estados `quarantine` y `scanning` representan validación síncrona básica;
   todavía no existe antivirus profundo, sandbox ni Queue de escaneo.
3. No existe aún una conversión/preview completo para Office.
4. Debe probarse la matriz real de PDF, OOXML, CSV, TXT e imágenes.
5. Integrar `DocsPublicModule` en el host real de micrositios.

No debe trasladarse el antivirus profundo al Worker. La dirección acordada es
Queue + runner o escáner externo.

### 5.4 Formulario y Solicitudes

Archivos principales:

- `infra/d1/migrations/0008_lmwares_forms_module.sql`
- `packages/domain/src/models/site-forms.ts`
- `packages/validation/src/site-forms.ts`
- `packages/db/src/repositories/site-forms.ts`
- `workers/admin-api/src/routes/site-forms.ts`
- `workers/public-api/src/routes/site-forms.ts`
- `apps/admin-web/src/features/site-modules/forms/FormsWorkspace.tsx`
- `apps/admin-web/src/features/site-modules/forms/formsWorkspace.css`
- `apps/admin-web/src/features/site-modules/forms/formsApi.ts`
- `apps/public-web/src/features/site-modules/forms/FormPublicModule.tsx`
- `apps/public-web/src/features/site-modules/forms/formPublicModule.css`

Implementado:

- definición configurable de formulario;
- campos de texto, correo, teléfono, área de texto, select y checkbox;
- revisión publicada inmutable para validar solicitudes;
- inbox administrativo;
- detalle, notas e historial;
- estados `new`, `in_progress`, `responded`, `closed` y `spam`;
- auditoría;
- honeypot;
- Turnstile cuando `TURNSTILE_DISABLED !== '1'`;
- límite de cuerpo y validación contra la definición publicada;
- rechazo de campos desconocidos;
- respuesta pública que no expone notas, estado ni payload interno.

Deuda conocida:

- `GET /admin/projects/:projectId/modules/forms` llama
  `ensureForProject` y puede crear el formulario inicial. Es práctico para el
  MVP, pero un `GET` con efecto de escritura debe revisarse antes de producción.

Pendiente:

- prueba E2E de publicación y envío público;
- probar Turnstile realmente habilitado;
- controles de rate limiting adicionales;
- integrar `FormPublicModule` en el host real de micrositios.

### 5.5 Eventos

Archivos principales:

- `infra/d1/migrations/0009_lmwares_events_module.sql`
- `packages/domain/src/models/site-events.ts`
- `packages/validation/src/site-events.ts`
- `packages/db/src/repositories/site-events.ts`
- `workers/admin-api/src/routes/site-events.ts`
- `workers/public-api/src/routes/site-events.ts`
- `apps/admin-web/src/features/site-modules/events/EventsWorkspace.tsx`
- `apps/admin-web/src/features/site-modules/events/eventsWorkspace.css`
- `apps/admin-web/src/features/site-modules/events/eventsApi.ts`
- `apps/public-web/src/features/site-modules/events/EventsPublicModule.tsx`
- `apps/public-web/src/features/site-modules/events/eventsPublicModule.css`

Implementado:

- agenda pública;
- estados `draft`, `published`, `cancelled` y `completed`;
- fechas UTC y zona IANA;
- cupo opcional;
- cierre de inscripción;
- listado de asistentes en admin;
- registro público;
- deduplicación por evento y correo;
- protección básica contra sobrecupo mediante operación D1 batch;
- portada opcional mediante `fileAssetId`.

Pendiente:

- carga de portada desde el propio workspace;
- pruebas de concurrencia para el último cupo;
- pruebas E2E de registro, cancelación y cierre;
- integrar `EventsPublicModule` en el host real de micrositios.

## 6. Migraciones y estado D1 local

Migraciones de esta tanda:

| Migración | Módulo |
| --- | --- |
| `0005_lmwares_blog_module.sql` | Blog |
| `0006_lmwares_galleries_module.sql` | Galerías |
| `0007_lmwares_docs_module.sql` | Docs |
| `0008_lmwares_forms_module.sql` | Formularios/Solicitudes |
| `0009_lmwares_events_module.sql` | Eventos |

El 2026-07-28 se verificó que el D1 local contiene, entre otras, estas tablas:

- `lmwares_site_blog_articles`;
- `site_gallery_albums`;
- `site_gallery_images`;
- `lmwares_doc_categories`;
- `lmwares_docs`;
- `lmwares_doc_versions`;
- `lmwares_site_forms`;
- `lmwares_site_form_requests`;
- `lmwares_site_form_request_notes`;
- `lmwares_site_form_status_history`;
- `lmwares_site_form_audit_events`;
- `lmwares_events`;
- `lmwares_event_registrations`.

No se aplicaron migraciones remotas.

## 7. Validación realizada

### 7.1 Validación técnica del corte

El 2026-07-28:

- `npm run typecheck`: 16 tareas correctas de 16;
- `npm run check:workers`: dry-run correcto para Public API y Admin API;
- Public Worker: aproximadamente 366.99 KiB, gzip 69.89 KiB;
- Admin Worker: aproximadamente 424.00 KiB, gzip 80.85 KiB;
- `npm run db:tables:local`: correcto y con las tablas de módulos presentes.

En la sesión anterior:

- `npm run build`: 10 tareas correctas de 10;
- smoke GET de los cinco módulos sobre el proyecto `astraeus`;
- revisión visual de Blog, Galerías, Docs, Solicitudes y Eventos;
- sin overflow horizontal;
- sin alertas;
- sin errores de consola.

`npm run lint` finaliza correctamente, pero en la mayoría de paquetes el script
sólo imprime `no lint configured`. No debe interpretarse como una revisión real
de ESLint.

### 7.2 Lo que no fue probado

- no hay tests unitarios específicos de los cinco módulos;
- no hay suite de integración específica;
- no hay E2E de las mutaciones;
- no se hizo prueba de carga o concurrencia;
- no se verificó Cloudflare remoto;
- no se probó autenticación real de Access;
- no se probó Turnstile real;
- no se probó un antivirus externo;
- no se ejecutó un ciclo completo desde el configurador hasta un micrositio
  publicado con estos módulos.

## 8. Estado actual de los procesos locales

Al revisar el 2026-07-28:

- `127.0.0.1:5273` sí estaba escuchando;
- `5274`, `8887` y `8888` no estaban escuchando.

Por ello, una pestaña del navegador abierta en
`http://127.0.0.1:5274/projects/astraeus/modules/events` puede conservar una
captura anterior, pero el servicio administrativo debe levantarse de nuevo.

Comando recomendado:

```powershell
npm run dev:local
```

Puertos esperados:

```text
Public web  http://127.0.0.1:5273
Admin web   http://127.0.0.1:5274/projects
Public API  http://127.0.0.1:8887
Admin API   http://127.0.0.1:8888
```

Si el script general entra en conflicto con el proceso existente de `5273`, se
pueden levantar los servicios necesarios por separado:

```powershell
npm run dev:admin-web
npm run dev:public-api
npm run dev:admin-api
```

## 9. Brecha principal: componentes públicos sin host

Los cinco componentes públicos existen bajo:

```text
apps/public-web/src/features/site-modules/
```

Pero todavía no están importados por una página o compositor real del
micrositio. En el estado actual son componentes reutilizables aislados.

La siguiente integración importante es construir un registro/compositor:

```ts
moduleKey -> public component
```

que reciba la selección del proyecto y ensamble secciones verticales sin crear
un sitio diferente por cada combinación.

Esta capa debe:

1. obtener los módulos habilitados del proyecto;
2. ordenar las secciones;
3. montar sólo los módulos seleccionados;
4. reutilizar los mismos componentes en preview y publicación;
5. proporcionar `projectId` y `apiBaseUrl`;
6. mantener rutas internas de detalle para Blog, Galerías, Docs y Eventos;
7. conservar Landing como base, pero sin convertirla todavía en un editor
   administrativo genérico.

## 10. Próximo plan recomendado

### P0. Proteger el trabajo actual

1. Revisar el worktree completo.
2. Identificar qué cambios pertenecen al configurador/Free y cuáles a módulos.
3. No eliminar ni reformatear archivos ajenos.
4. Preparar un commit limitado sólo cuando el usuario lo solicite.

### P1. Completar un vertical E2E

Empezar por Blog o Formulario:

1. levantar D1/R2/APIs/web;
2. crear datos desde el admin;
3. previsualizar;
4. guardar borrador;
5. publicar;
6. consumir la API pública;
7. montar el componente público dentro de un micrositio vertical;
8. documentar fallos;
9. agregar pruebas.

Después repetir el mismo contrato para los demás módulos.

### P1. Construir el compositor público

Crear el host dinámico descrito en la sección 9 y conectarlo con la selección de
módulos del configurador.

### P1. Endurecer archivos

1. Implementar checksum SHA-256 para Docs.
2. Probar allowlist y magic bytes con un corpus de archivos.
3. Diseñar Queue/runner para escaneo profundo.
4. Verificar limpieza de objetos R2 ante cualquier fallo parcial.

### P1. Pruebas

Agregar al menos:

- repositorios D1;
- esquemas Zod;
- autorización administrativa;
- HTML hostil del Blog;
- archivos hostiles de Docs y Galerías;
- validación dinámica de Formularios;
- concurrencia y cupos de Eventos;
- E2E de publicación.

### P2. Operación y despliegue

Sólo después de los verticales locales:

- configurar Access real;
- configurar Turnstile real;
- aplicar migraciones remotas con autorización explícita;
- configurar R2 remoto;
- desplegar Workers;
- configurar observabilidad;
- documentar rollback.

## 11. Comandos de reanudación

Desde `C:\dev\oracle`:

```powershell
git status --short
npm run db:migrate:local
npm run db:tables:local
npm run typecheck
npm run check:workers
npm run dev:local
```

Ruta de revisión:

```text
http://127.0.0.1:5274/projects/astraeus/modules/blog
http://127.0.0.1:5274/projects/astraeus/modules/galleries
http://127.0.0.1:5274/projects/astraeus/modules/docs
http://127.0.0.1:5274/projects/astraeus/modules/forms
http://127.0.0.1:5274/projects/astraeus/modules/events
```

En desarrollo local, el proyecto `astraeus` fue utilizado para los smoke tests.

## 12. Definición de terminado para la próxima entrega

Una siguiente entrega razonable debe cumplir:

- al menos un módulo completa el ciclo admin → D1/R2 → API pública → micrositio;
- el preview usa el mismo componente que la publicación;
- existen pruebas automatizadas del camino principal y de entradas hostiles;
- no hay escrituras inesperadas en endpoints GET;
- los documentos poseen checksum;
- el trabajo puede aislarse en un commit revisable;
- no se desplegó producción sin aprobación.

## 13. Archivos de contexto relacionados

Leer antes de ampliar la arquitectura:

- `docs/LMWARES-ORACLE-ARCHITECTURE.md`
- `docs/LMWARES-SUBSCRIPTIONS-ORACLE-VISION.md`
- `docs/LMWARES-AGENTIC-UI-DESIGN-PRACTICES.md`
- `docs/LMWARES-REGISTRY.md`
- `docs/LMWARES-LOCAL-RUNNER.md`
- `docs/LMWARES-AGENT-RUNNER.md`

Este documento describe el estado del código observado y no sustituye una
auditoría de seguridad ni una revisión jurídica/comercial.
