# Setup local

Guía para levantar la plantilla en tu máquina y crear los recursos de Cloudflare.

## 1. Requisitos

- **Node.js 20+** (`node -v`)
- **pnpm 9+** — habilítalo con Corepack:
  ```bash
  corepack enable && corepack prepare pnpm@9.12.0 --activate
  ```
- **Cuenta de Cloudflare** + Wrangler (incluido como devDependency; se invoca con `pnpm`).

## 2. Instalar dependencias

```bash
pnpm install
```

## 3. Variables de entorno

Copia los ejemplos (ninguno contiene secretos reales):

```bash
cp .env.example .env
cp apps/public-web/.env.example apps/public-web/.env
cp apps/admin-web/.env.example apps/admin-web/.env
cp workers/public-api/.dev.vars.example workers/public-api/.dev.vars
# admin-api no requiere secretos en local
```

Detalle de cada variable en [env.md](./env.md).

## 4. Crear recursos de Cloudflare

```bash
pnpm dlx wrangler login

# D1
pnpm dlx wrangler d1 create starter-db
# → copia el "database_id" devuelto en los TRES wrangler.toml:
#   infra/d1/wrangler.toml, workers/public-api/wrangler.toml, workers/admin-api/wrangler.toml

# R2
pnpm dlx wrangler r2 bucket create starter-media
```

> En local puedes saltarte la creación remota: D1 y R2 funcionan en modo local
> (miniflare). Solo necesitas crear los recursos al desplegar a producción.

## 5. Migrar y sembrar la base (local)

Las migraciones y ambos Workers comparten el MISMO estado local
(`.wrangler/state`), por lo que los datos son consistentes entre servicios.

```bash
pnpm db:migrate:local
pnpm db:seed:local      # datos de ejemplo (opcional)
```

## 6. Levantar todo en desarrollo

En terminales separadas (o `pnpm dev` para todo en paralelo con Turborepo):

```bash
pnpm --filter @workers/public-api dev   # http://localhost:8787
pnpm --filter @workers/admin-api dev    # http://localhost:8788
pnpm --filter @apps/public-web dev      # http://localhost:5173
pnpm --filter @apps/admin-web dev       # http://localhost:5174
```

- **En local Turnstile y Access están desactivados** (`TURNSTILE_DISABLED=1`,
  `ACCESS_DISABLED=1`). El admin asume el usuario `admin@example.com`; puedes
  cambiarlo enviando el header `X-Dev-Email`.

## 7. Probar el flujo

1. Abre el portal admin (5174) → crea una publicación → súbele una imagen →
   cámbiala a `published`.
2. Abre el frontend público (5173) → debe aparecer en el catálogo y su detalle.
3. Envía el formulario de contacto → revisa la solicitud en el admin.

## Comandos útiles

```bash
pnpm typecheck     # TS en todo el monorepo
pnpm build         # build de apps + typecheck de paquetes/workers
pnpm format        # Prettier
pnpm --filter @infra/d1 tables:local   # listar tablas locales
```

## Despliegue

Ver [launch-checklist.md](./launch-checklist.md) y `infra/wrangler/README.md`.
