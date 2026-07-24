# Setup local

Guía para levantar la plantilla en tu máquina y crear los recursos de Cloudflare.
En Windows usa `C:\dev\<proyecto>` como ruta de trabajo; evita `Documents` para
no chocar con sandboxing, OneDrive o Controlled Folder Access.

## 1. Requisitos

- **Node.js 20+** (`node -v`)
- **npm 10+** (`npm -v`)
- **Cuenta de Cloudflare** para despliegue. Wrangler va fijado en el workspace y
  tambien se puede invocar con `npx wrangler@4.105.0`.

## 2. Camino rapido local

Desde la raiz del repo:

```powershell
npm run setup:local
```

Ese script:

- verifica que la ruta sea escribible y que Node/npm existan;
- ejecuta `npm install`;
- copia `.env.example` y `.dev.vars.example`;
- aplica migraciones D1 locales con `--persist-to ./.wrangler/state`;
- carga seed local;
- corre typecheck.

## 3. Variables de entorno manuales

Copia los ejemplos (ninguno contiene secretos reales):

```bash
cp .env.example .env
cp apps/public-web/.env.example apps/public-web/.env
cp apps/admin-web/.env.example apps/admin-web/.env
cp workers/public-api/.dev.vars.example workers/public-api/.dev.vars
# admin-api no requiere secretos en local
```

Detalle de cada variable en [env.md](./env.md).

## 4. Crear recursos de Cloudflare para produccion

```bash
npx wrangler@4.105.0 login

# D1
npx wrangler@4.105.0 d1 create starter-db
# -> copia el "database_id" devuelto en los TRES wrangler.toml:
#   infra/d1/wrangler.toml, workers/public-api/wrangler.toml, workers/admin-api/wrangler.toml

# R2
npx wrangler@4.105.0 r2 bucket create starter-media
```

> En local puedes saltarte la creacion remota: D1 y R2 funcionan en modo local
> (miniflare). Solo necesitas crear los recursos al desplegar a producción.

## 5. Migrar y sembrar la base (local)

Las migraciones y ambos Workers comparten el MISMO estado local
(`.wrangler/state`), por lo que los datos son consistentes entre servicios.

```bash
npm run db:migrate:local
npm run db:seed:local      # datos de ejemplo (opcional)
```

## 6. Levantar todo en desarrollo

En terminales separadas (o `npm run dev` para todo en paralelo con Turborepo):

```bash
npm run dev --workspace @workers/public-api   # http://127.0.0.1:8887
npm run dev --workspace @workers/admin-api    # http://127.0.0.1:8888
npm run dev --workspace @apps/public-web      # http://localhost:5273
npm run dev --workspace @apps/admin-web       # http://localhost:5274
```

O usa el wrapper con preflight de puertos:

```powershell
npm run dev:local
```

- **En local Turnstile y Access están desactivados** (`TURNSTILE_DISABLED=1`,
  `ACCESS_DISABLED=1`). El admin asume el usuario `admin@example.com`; puedes
  cambiarlo enviando el header `X-Dev-Email`.

## 7. Probar el flujo

1. Ejecuta la validacion automatica:

   ```powershell
   npm run validate:local
   ```

2. Abre el portal admin (5274) → crea una publicación → súbele una imagen →
   cámbiala a `published`.
3. Abre el frontend público (5173) → debe aparecer en el catálogo y su detalle.
4. Envía el formulario de contacto → revisa la solicitud en el admin.

## 8. Flujo de proyecto cliente

Para proyectos nuevos, usa esta guia local junto con:

- [four-phase-methodology.md](./four-phase-methodology.md)
- [client-review-checklist.md](./client-review-checklist.md)
- [managed-cloudflare-hosting.md](./managed-cloudflare-hosting.md)
- [adversarial-playbook.md](./adversarial-playbook.md)

## Comandos útiles

```bash
npm run typecheck     # TS en todo el monorepo
npm run check:workers # bundle dry-run de ambos Workers
npm run build         # build de apps + typecheck de paquetes/workers
npm run format        # Prettier
npm run db:tables:local   # listar tablas locales
```

## Despliegue

Ver [launch-checklist.md](./launch-checklist.md) y `infra/wrangler/README.md`.
