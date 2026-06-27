# infra/d1 — Base de datos D1

Esquema y datos de la plantilla. Los Workers consumen esta misma base vía su binding `DB`.

## Flujo

```bash
# 1. Crear la base (una vez) y copiar el database_id a wrangler.toml
wrangler d1 create starter-db

# 2. Aplicar migraciones en local
pnpm --filter @infra/d1 migrate:local

# 3. (Opcional) Sembrar datos de ejemplo
pnpm --filter @infra/d1 seed:local

# 4. Aplicar en remoto cuando estés listo
pnpm --filter @infra/d1 migrate:remote
```

## Crear una nueva migración

```bash
pnpm --filter @infra/d1 migrate:create  # crea migrations/000X_descripcion.sql
```

Edita el archivo generado, vuelve a correr `migrate:local` / `migrate:remote`.
Mantén `packages/db/src/rows.ts` en sync con cualquier cambio de columnas.
