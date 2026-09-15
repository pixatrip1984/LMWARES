# Mapa completo de módulos LMWares

Documento de arquitectura para mejorar los módulos que se integran en cada proyecto. Describe el estado real del repositorio al **15 de septiembre de 2026**, dónde vive cada pieza y cómo se ensambla.

## 1. Resumen ejecutivo

Un proyecto comercial tiene dos módulos base y complementos seleccionables:

| Grupo | IDs | Estado |
|---|---|---|
| Base pública/admin | `landing`, `panel` | Obligatorios en paquetes pagados; la fase 0 sólo demuestra la parte pública |
| Complementos seleccionables actuales (6) | `blog`, `galleries`, `catalog`, `quote`, `events`, `docs` | Disponibles para Starter/Pro, sujetos a límites del plan |
| Complementos Pro futuros (2) | `cart`, `data` | Declarados en el catálogo, pero bloqueados comercialmente; aún no son contratables |

Hay dos ensamblajes distintos:

1. **Preview dinámico del starter:** React monta módulos públicos reales mediante `SiteModuleComposer` y APIs por proyecto.
2. **Demo comercial de fase 0:** el runner recibe un `DemoBuildSpec` inmutable, genera un paquete estático con ChatGPT/Flash, valida rutas/assets y lo publica como release. No monta los componentes React anteriores dentro de la demo; representa sólo el alcance público autorizado.

## 2. Fuentes de verdad y contratos

### Catálogo y selector comercial

- `apps/public-web/src/features/package-builder/packageBuilderModel.ts`
  - `PackageModuleId`, `PACKAGE_MODULES`, `FOUNDATION_MODULES`, `PRO_ONLY_MODULES`.
  - Planes `free`, `starter`, `pro`.
  - Semillas y reglas del configurador (`getPlanSeed`, `togglePackageModule`, `getModuleSelectionError`).
- `apps/public-web/src/pages/PackageBuilderPage.tsx`
  - UI del configurador, selección de módulos, preview, brief y envío de intake.
- `packages/domain/src/models/package-payment.ts`
  - Contrato canónico compartido: `PACKAGE_MODULE_IDS` y planes pagados `starter`/`pro`.
- `packages/domain/src/models/package-pricing.ts`
  - Disponibilidad, normalización y reglas de precio.

### Regla comercial actual

```ts
const FOUNDATION_MODULES = ['landing', 'panel'];
const UPCOMING_PAID_PACKAGE_MODULES = ['cart', 'data'];

function isPaidPackageModuleAvailable(id) {
  return !UPCOMING_PAID_PACKAGE_MODULES.includes(id);
}

// Todo paquete pagado exige landing + panel.
// Starter: 1–2 complementos.
// Pro: al menos 3 complementos, aunque cart/data siguen bloqueados.
```

La función de dominio `normalizePaidPackageModules(plan, modules)` vuelve a validar lo recibido por API; la UI nunca es la única barrera.

## 3. Ensamblaje del preview dinámico

Archivo central: `apps/public-web/src/features/site-modules/SiteModuleComposer.tsx`.

```tsx
const SITE_MODULE_REGISTRY = {
  blog: BlogPublicModule,
  galleries: GalleriesPublicModule,
  docs: DocsPublicModule,
  forms: FormPublicModule,
  events: EventsPublicModule,
};

const enabled = normalizeSiteModules(modules);
return enabled.map((key) => {
  const Module = SITE_MODULE_REGISTRY[key];
  return <Module projectId={projectId} apiBaseUrl={apiBaseUrl} />;
});
```

`normalizeSiteModules` elimina IDs desconocidos y duplicados, conservando el orden recibido. `parseSiteModules` convierte `?modules=blog,galleries` en IDs seguros. `siteModuleFromPath` permite abrir un módulo por ruta.

Entrada del preview: `apps/public-web/src/pages/StarterSitePreviewPage.tsx`.

```text
/starter-sites/:projectId?modules=blog,galleries
/starter-sites/:projectId/blog
```

Importante: `landing` y `panel` no son componentes del `SiteModuleComposer`. El primero es la carcasa pública/página de inicio; el segundo corresponde al portal administrativo. El composer actual sólo registra cinco claves (`forms` en vez de `quote`).

## 4. Mapa de cada módulo

### 4.1 Base pública: `landing` (Sitio web)

**Qué hace:** página pública de presentación del negocio, navegación y CTA. Es el punto de entrada de todo proyecto.

**Dónde vive:**

- Catálogo/UI: `apps/public-web/src/features/package-builder/packageBuilderModel.ts` (`id: landing`).
- Preview conceptual: `apps/public-web/src/features/package-builder/packagePreviewModel.ts` (`PUBLIC_HOME_SCREEN`).
- Preview de starter: `apps/public-web/src/pages/StarterSitePreviewPage.tsx` (hero y carcasa).
- Demo publicada: la ruta `/` del `routeManifest` y los artefactos generados por el runner.
- Resolver estable de demo: `workers/public-api/src/routes/commercial-demo-sites.ts`.

**Comportamiento:** presenta el contenido público permitido por el `DemoBuildSpec`; antes del release muestra una pantalla “demo en preparación”. El servidor devuelve `noindex`, `nosniff` y `no-store` para fase 0.

**Extracto de resolución:**

```ts
if (releaseApprovedAndPublished) return MEDIA.get(routeObjectKey('/'));
if (lifecycle.demoAssetKey) return MEDIA.get(lifecycle.demoAssetKey);
return renderDemoPreparing(lifecycle.siteName);
```

### 4.2 Base admin: `panel`

**Qué hace:** espacio privado para administrar el contenido y la operación del proyecto. No se simula como funcional en la demo pública.

**Dónde vive:**

- Catálogo: `packageBuilderModel.ts` (`id: panel`, módulo base).
- Preview conceptual: `packagePreviewModel.ts` (`ADMIN_HOME_SCREEN`, “Resumen”).
- Portal: `apps/admin-web/src/` y sus rutas autenticadas.
- Selección/revisión comercial: `apps/admin-web/src/pages/CommercialIntakesPage.tsx` y `SalesPage.tsx`.

**Alcance:** el panel es la superficie común desde la que se administran Blog, Galerías, Catálogo, Solicitudes, Eventos y Docs. La autorización real la aplican las rutas del `workers/admin-api`; no debe inferirse del ID enviado por el navegador.

### 4.3 `blog` (Blog)

**Qué hace:** publicación de artículos con título, resumen, categoría, portada y cuerpo editorial. Permite listado público y detalle por `slug`.

**Frontend público:** `apps/public-web/src/features/site-modules/blog/BlogPublicModule.tsx` + `blogPublicModule.css`.

**Admin:** `apps/admin-web/src/features/site-modules/blog/BlogWorkspace.tsx`, `blogApi.ts`, `blogWorkspace.css`.

**Backend y datos:**

- Modelo: `packages/domain/src/models/site-blog.ts`.
- Validación: `packages/validation/src/site-blog.ts`.
- Repositorio D1: `packages/db/src/repositories/site-blog.ts`.
- Rutas admin: `workers/admin-api/src/routes/site-blog.ts`.
- Rutas públicas: `workers/public-api/src/routes/site-blog.ts`.

**Flujo principal:** el público solicita `/sites/:projectId/blog`; para detalle solicita `/blog/:slug`. El Worker entrega `bodyHtml` sanitizado y resuelve portadas a URLs públicas sin exponer claves R2.

```ts
http.get(`/sites/${projectId}/blog`)
  -> setPage(listado)
openArticle(slug)
  -> http.get(`/sites/${projectId}/blog/${slug}`)
  -> setArticle(detalle)
```

Estados editoriales: `draft`, `published`, `archived`; el público sólo recibe publicados.

### 4.4 `galleries` (Galerías)

**Qué hace:** álbumes navegables con portada, descripción, categoría, orden y galería de imágenes; incluye detalle y lightbox.

**Frontend público:** `apps/public-web/src/features/site-modules/galleries/GalleriesPublicModule.tsx` + CSS.

**Admin:** `apps/admin-web/src/features/site-modules/galleries/GalleriesWorkspace.tsx`, `galleriesApi.ts`, `galleriesWorkspace.css`.

**Backend y datos:** `packages/domain/src/models/site-gallery.ts`, `packages/validation/src/site-gallery.ts`, `packages/db/src/repositories/site-gallery.ts`, rutas `workers/admin-api/src/routes/site-gallery.ts` y `workers/public-api/src/routes/site-gallery.ts`.

**Flujo principal:** sin `slug` carga el listado; con `slug` carga el álbum. La navegación usa `history.pushState`, conserva accesibilidad de teclado y nunca expone la key de R2.

```ts
const path = slug
  ? `${routeBase}/${encodeURIComponent(slug)}`
  : routeBase;
history.pushState({}, '', path);
setSlug(slug);
```

Estados: `draft` y `published`. Las imágenes están relacionadas mediante `fileAssetId`, posición y texto alternativo.

### 4.5 `catalog` (Catálogo)

**Qué hace:** muestra productos/servicios o unidades en fichas navegables, con filtros, búsqueda y detalle. Es informativo; no es carrito ni checkout.

**Dónde vive hoy:**

- Catálogo comercial: `packageBuilderModel.ts` (`id: catalog`).
- Preview visual y datos de demostración: `PackagePreviewModal.tsx` (`PUBLIC_SECTIONS.catalog`, `catalogItems`).
- Pantallas conceptuales: `packagePreviewModel.ts` (`public-catalogo`, `public-catalogo-detalle`, `admin-catalogo`).
- Página pública heredada/independiente: `apps/public-web/src/pages/CatalogPage.tsx`.
- Reglas de alcance: `packages/domain/src/services/commercial-scope.ts` y `commercial-demo-build-spec.ts`.

**Estado de integración:** a diferencia de Blog/Galerías/Eventos/Docs/Formularios, no existe todavía un `CatalogPublicModule` registrado en `SiteModuleComposer`, ni se observa en este mapa un workspace/API D1 específico de catálogo. El preview usa datos locales; la demo comercial lo representa como contenido estático autorizado.

**Lógica conceptual del preview:**

```ts
const selected = new Set(draft.modules);
return PUBLIC_ORDER
  .filter((id) => selected.has(id))
  .map((id) => PUBLIC_SECTIONS[id]);
```

**Límite contractual:** catálogo = consulta y detalle sobre datos de demostración; no pagos, checkout, inventario real ni transacciones.

### 4.6 `quote` / `forms` (Formulario y solicitudes)

**Qué hace:** formulario público configurable para recibir solicitudes estructuradas (cotización, contacto, diagnóstico, etc.) y bandeja admin para revisarlas.

**Nota de mapeo:** el ID comercial es `quote`; el runtime de módulos usa la clave `forms`. Esa traducción debe mantenerse explícita al mejorar el sistema.

**Frontend público:** `apps/public-web/src/features/site-modules/forms/FormPublicModule.tsx` + CSS.

**Admin:** `apps/admin-web/src/features/site-modules/forms/FormsWorkspace.tsx`, `formsApi.ts`, `formsWorkspace.css`.

**Backend y datos:** `packages/domain/src/models/site-forms.ts`, `packages/validation/src/site-forms.ts`, `packages/db/src/repositories/site-forms.ts`, rutas admin/públicas `site-forms.ts`.

**Flujo principal:** obtiene la definición publicada, crea respuestas iniciales, valida Turnstile si está configurado y envía sólo `answers` por ID de campo.

```ts
fetch(`/sites/${projectId}/forms`)
  -> publishedDefinition
fetch(`/sites/${projectId}/forms/requests`, {
  method: 'POST',
  body: JSON.stringify({ answers, website, turnstileToken })
});
```

El servidor reconstruye tipo, opciones y restricciones desde la definición publicada. Estados de solicitud: `new`, `in-progress`, `responded`, `closed`, `spam`. El honeypot `website` y Turnstile son controles anti-spam; no sustituyen la autorización del Worker.

### 4.7 `events` (Eventos)

**Qué hace:** agenda de eventos publicados, detalle, cupo, disponibilidad y registro de asistentes.

**Frontend público:** `apps/public-web/src/features/site-modules/events/EventsPublicModule.tsx` + CSS.

**Admin:** `apps/admin-web/src/features/site-modules/events/EventsWorkspace.tsx`, `eventsApi.ts`, `eventsWorkspace.css`.

**Backend y datos:** `packages/domain/src/models/site-events.ts`, `packages/validation/src/site-events.ts`, `packages/db/src/repositories/site-events.ts`, rutas admin/públicas `site-events.ts`.

**Flujo principal:** carga eventos, separa próximos/pasados, abre detalle y registra mediante endpoint específico. Las fechas de negocio se almacenan en UTC y se presentan con la zona IANA del evento.

```ts
const upcoming = events.filter((e) => e.endsAtUtc >= now);
await http.post(`/events/${selected.id}/registrations`, {
  fullName, email, phone, notes, website: ''
});
```

El servidor calcula `registrationCount`, `spotsRemaining` y `registrationOpen`; no confiar en cálculos del cliente para cupo. Estados de evento: `draft`, `published`, `cancelled`, `completed`.

### 4.8 `docs` (Biblioteca documental)

**Qué hace:** biblioteca pública de documentos publicados, categorizada, buscable y descargable desde R2 privado mediante URLs controladas.

**Frontend público:** `apps/public-web/src/features/site-modules/docs/DocsPublicModule.tsx` + CSS.

**Admin:** `apps/admin-web/src/features/site-modules/docs/DocsWorkspace.tsx`, `docsApi.ts`, `docsWorkspace.css`.

**Backend y datos:** `packages/domain/src/models/site-docs.ts`, `packages/validation/src/site-docs.ts`, `packages/db/src/repositories/site-docs.ts`, rutas admin/públicas `site-docs.ts`.

**Flujo principal:** carga la biblioteca publicada, filtra localmente por categoría/título/descripción/nombre y usa `downloadUrl` resuelta por el Worker.

```ts
fetch(`/sites/${projectId}/documents`)
  -> SiteDocsPublicLibrary
documents.filter((doc) => matchesCategory && matchesQuery)
```

Seguridad: D1 almacena metadata; bytes viven en R2 privado; se validan extensión, MIME, firma y contenido activo. Estados de versión incluyen `quarantine`, `scanning`, `clean`, `rejected`, `published`. La descarga usa `Content-Disposition` y `nosniff`; no se renderizan archivos Office dentro del navegador.

### 4.9 `cart` (E-Commerce, Pro futuro)

**Qué promete el catálogo:** selección, pedido y checkout visual.

**Dónde aparece:** `packageBuilderModel.ts`, `packagePreviewModel.ts`, `PackagePreviewModal.tsx`, pantallas `public-carrito`/`admin-compras`, y en contratos de dominio/precio.

**Estado real:** `UPCOMING_PAID_PACKAGE_MODULES = ['cart', 'data']`; `isPaidPackageModuleAvailable('cart')` devuelve `false`. No está registrado en `SiteModuleComposer`, no hay workspace público operativo en `apps/public-web/src/features/site-modules`, y el alcance de demo lo marca como no disponible.

**Requisito para activarlo:** definir catálogo transaccional, carrito persistente, checkout, pagos, webhooks, inventario, permisos, pruebas antifraude y separación clara entre demo y producción. Hasta entonces sólo es una capacidad anunciada/visual.

### 4.10 `data` (AI Optimization, Pro futuro)

**Qué promete el catálogo:** ciclos de medición, decisión y mejora continua.

**Dónde aparece:** `packageBuilderModel.ts`, `packagePreviewModel.ts`, pantalla conceptual `admin-resultados`.

**Estado real:** bloqueado por la misma compuerta de disponibilidad; no existe módulo runtime registrado ni integración de datos/IA contratable.

**Requisito para activarlo:** definir fuentes de eventos, consentimiento, almacenamiento, métricas, retención, permisos, coste de inferencia, explicabilidad y controles para no convertir datos de clientes en contenido público.

## 5. Flujo completo de un proyecto comercial

```text
Configurador público
  -> PackageDraft { plan, modules, brief }
  -> POST /commercial-intakes
  -> normalizePaidPackageModules (dominio)
  -> oferta admin y aceptación
  -> buildDemoBuildSpec()
  -> generationManifest (módulos públicos + rutas + assets)
  -> runner genera creative-plan/code-package/assets
  -> assemble-release valida, agrega route-manifest y checksums
  -> upload-release a R2
  -> admin aprueba release
  -> slug estable sirve la demo publicada
```

El `DemoBuildSpec` filtra datos privados y congela `acceptedOffer.modules` como `allowed.publicModules`. La demo de fase 0 sólo puede mostrar una presentación pública estática; panel, autenticación, documentos privados, envíos reales, pagos e integraciones quedan excluidos.

## 6. Cómo se decide qué se ensambla

1. La entrevista comercial produce un perfil y módulos sugeridos (`buildBusinessProfile` en `businessInterviewModel.ts`).
2. El usuario confirma módulos en `PackageBuilderPage`.
3. `normalizePaidPackageModules` deduplica, exige `landing`/`panel`, bloquea `cart`/`data` y aplica límites Starter/Pro.
4. `buildDemoBuildSpec` copia los módulos aceptados a `allowed.publicModules` y genera interacciones permitidas.
5. `commercial-demo-generation-manifest.ts` convierte el expediente en slots de assets e IA de rutas.
6. El runner no “instala” módulos React: ensambla artefactos estáticos entregados por el agente y exige que exista un archivo por cada ruta del manifiesto.

## 7. Gaps prioritarios para la mejora

- Unificar `quote` (comercial) con `forms` (runtime) mediante un mapa tipado, evitando traducciones implícitas.
- Crear una interfaz de módulo común para que `catalog` pueda entrar al composer sin datos locales de preview.
- Separar explícitamente “capacidad vendible”, “preview conceptual”, “módulo runtime” y “módulo de demo”.
- Añadir un registro compartido de módulos con: ID, etiqueta, rutas públicas/admin, endpoints, permisos, migraciones, estado de disponibilidad y pruebas.
- Evitar que `cart` y `data` aparezcan como seleccionables activos mientras la compuerta de dominio los rechaza.
- Definir contratos de ensamblaje reproducible para que una combinación de módulos pueda generar automáticamente frontend, rutas, permisos y migraciones.
- Añadir pruebas de matriz: cada combinación permitida debe validar selector, intake, build spec, preview, runtime y release.

## 8. Archivos de referencia rápida

| Propósito | Archivo |
|---|---|
| IDs, catálogo, planes y selector | `apps/public-web/src/features/package-builder/packageBuilderModel.ts` |
| Configurador | `apps/public-web/src/pages/PackageBuilderPage.tsx` |
| Composer público | `apps/public-web/src/features/site-modules/SiteModuleComposer.tsx` |
| Preview público/admin | `apps/public-web/src/features/package-builder/packagePreviewModel.ts` y `PackagePreviewModal.tsx` |
| Contrato de módulos pagados | `packages/domain/src/models/package-payment.ts` |
| Disponibilidad y precio | `packages/domain/src/models/package-pricing.ts` |
| Capacidades comerciales | `packages/domain/src/services/commercial-scope.ts` |
| Expediente de demo | `packages/domain/src/services/commercial-demo-build-spec.ts` |
| Manifiesto de generación | `packages/domain/src/services/commercial-demo-generation-manifest.ts` |
| Ensamblaje de release | `scripts/lmwares-commercial-demo-runner/assemble-release.mjs` |
| Resolver de demo publicada | `workers/public-api/src/routes/commercial-demo-sites.ts` |

## 9. Espacio para decisiones de la próxima iteración

Anota aquí qué módulos quieres mejorar primero, si deben conservar sus IDs, qué capacidades deben ser reales en producción y qué parte debe entrar en el ensamblaje automático.

