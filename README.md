# Cloudflare Starter — Plantilla madre

Motor base **Cloudflare-first** y reutilizable para construir proyectos web
pequeños y medianos full stack: frontend público, portal admin privado, APIs,
base de datos, almacenamiento de archivos y seguridad lista de fábrica.

No es una landing específica: es la **base técnica** sobre la que se construyen
productos (catálogos sin pagos, galerías/portfolios, mini-CRMs, paneles de
negocio local) agregando configuración, campos extra, copy, diseño y reglas.

## Stack

| Capa            | Tecnología                                  |
| --------------- | ------------------------------------------- |
| Frontend        | React + Vite + TypeScript + Tailwind        |
| Hosting front   | Cloudflare Pages (público y admin)          |
| Backend         | Cloudflare Workers + Hono                   |
| Base de datos   | Cloudflare D1 (SQLite)                      |
| Archivos        | Cloudflare R2                               |
| Auth admin      | Cloudflare Access (JWT)                     |
| Anti-spam       | Cloudflare Turnstile (validado server-side) |
| Monorepo        | pnpm workspaces + Turborepo                 |

## Arquitectura

```text
Web pública  ─▶  Public API Worker  ─▶  D1 / R2
(catálogo,        (GET publicaciones,
 formularios)      POST solicitudes,
                   Turnstile server-side)

Portal admin ─▶  Cloudflare Access ─▶  Admin API Worker ─▶  D1 / R2
(CRUD)            (verifica JWT)        (CRUD, imágenes,
                                         estados, notas,
                                         auditoría)
```

### Reglas no negociables

- React **nunca** accede directo a D1 ni R2: todo pasa por Workers.
- El Worker público solo expone datos públicos y recibe formularios.
- El Worker admin valida identidad de Cloudflare Access en `/admin/*`.
- Turnstile se valida **del lado servidor**.
- **Sin secretos en `VITE_*`**.
- D1 guarda datos y metadatos; R2 guarda binarios.

## Estructura

```text
apps/
  public-web/     Frontend público (catálogo, detalle, formulario)
  admin-web/      Portal admin (CRUD publicaciones y solicitudes)
workers/
  public-api/     API pública (Hono) + proxy /media + Turnstile
  admin-api/      API privada (Hono) + middleware Access + auditoría
packages/
  domain/         Modelos base y tipos (sin dependencias)
  validation/     Esquemas Zod compartidos (front + workers)
  db/             Repositorios D1 (única capa que toca la base)
  api-client/     Cliente HTTP tipado (público y admin)
  config/         Config por proyecto, env y keys de R2
  ui/             Componentes React + preset Tailwind compartido
infra/
  d1/migrations/  Esquema SQL    · d1/seeds/  Datos de ejemplo
  r2/             Convenciones de keys y CORS
  wrangler/       Convenciones de despliegue
docs/
  setup.md · env.md · launch-checklist.md · security-checklist.md
```

## Modelos base

`Publication`, `PublicationImage`, `Request`, `RequestNote`, `StatusHistory`,
`AuditEvent`, `AdminUser`, `FileAsset` — definidos en `packages/domain`.

## API

**Pública**

```text
GET  /publications          listado paginado (solo publicadas)
GET  /publications/:slug     detalle con imágenes
POST /requests               crear solicitud (Turnstile)
GET  /media/:key             proxy de lectura de R2
```

**Privada (tras Access)**

```text
GET   /admin/me
GET   /admin/publications              POST  /admin/publications
GET   /admin/publications/:id          PATCH /admin/publications/:id
PATCH /admin/publications/:id/status
POST  /admin/publications/:id/images   DELETE /admin/publications/:id/images/:imageId
GET   /admin/requests                  GET   /admin/requests/:id
PATCH /admin/requests/:id/status       POST  /admin/requests/:id/notes
GET   /admin/audit
```

## Quickstart

```bash
corepack enable && pnpm install
# crea recursos CF y copia el database_id (ver docs/setup.md)
pnpm db:migrate:local && pnpm db:seed:local
pnpm dev   # apps + workers en paralelo (Turborepo)
```

Guía completa en [docs/setup.md](./docs/setup.md).

## Cómo especializar para un proyecto nuevo

1. Renombra el prefijo `starter-` de los recursos (D1, R2, Workers) por tu slug.
2. Ajusta `packages/config/src/project.ts` (marca, tipos de solicitud, features).
3. Agrega campos extra en `metadata`/`payload` o nuevas columnas vía migración.
4. Personaliza copy y diseño en `apps/*` y `packages/ui`.
5. Añade reglas de negocio en los Workers (validaciones, estados propios).

> La lógica específica de cada producto se agrega **encima** del motor base, sin
> modificar la arquitectura ni las reglas de seguridad.
