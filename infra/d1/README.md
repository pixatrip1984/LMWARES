# infra/d1 — Base de datos D1

Esquema y datos de la plantilla. Los Workers consumen esta misma base vía su binding `DB`.

## Flujo

```bash
# 1. Crear la base remota (una vez) y copiar el database_id a wrangler.toml
npx wrangler@4.105.0 d1 create starter-db

# 2. Aplicar migraciones en local
npm run migrate:local --workspace @infra/d1

# 3. (Opcional) Sembrar datos de ejemplo
npm run seed:local --workspace @infra/d1

# 4. Aplicar en remoto cuando estés listo
npm run migrate:remote --workspace @infra/d1
```

## Crear una nueva migración

```bash
npm run migrate:create --workspace @infra/d1  # crea migrations/000X_descripcion.sql
```

Edita el archivo generado, vuelve a correr `migrate:local` / `migrate:remote`.
Mantén `packages/db/src/rows.ts` en sync con cualquier cambio de columnas.
