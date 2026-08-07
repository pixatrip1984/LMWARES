# Runbook de rollback (Workers, Pages, D1)

Procedimiento de reversión seguro para cada pieza del stack. Ningún paso aquí
borra datos productivos ni reescribe historial de git. Ejecuta siempre desde
`C:\dev\oracle` con PowerShell nativo.

## 0. Antes de revertir cualquier cosa

1. Corre el preflight (`scripts/lmwares-commercial-preflight.ps1`) y guarda su
   salida — es la evidencia de "antes" para comparar después del rollback.
2. Identifica si el problema es del **código del Worker/Pages** (revertir
   despliegue) o de **datos en D1** (requiere una migración compensatoria, no
   un "rollback" de D1 real — Cloudflare D1 no tiene deshacer transaccional
   de migraciones aplicadas).
3. Nunca combines ambos rollbacks a la vez sin verificar cuál causó el
   problema; revertir el Worker con un esquema D1 más nuevo puede romper
   columnas que el código viejo no espera.

## 1. Rollback de un Worker (`public-api` / `admin-api`)

Cloudflare guarda un historial de despliegues por Worker. Revertir NO borra
el despliegue roto; sólo enruta tráfico al anterior, así que es reversible en
ambas direcciones.

```powershell
# Lista los últimos despliegues con su ID (el más reciente arriba)
npx wrangler deployments list --config workers/public-api/wrangler.toml --env production

# Revierte al despliegue anterior conocido bueno (usa el ID exacto de la lista)
npx wrangler rollback <DEPLOYMENT_ID> --config workers/public-api/wrangler.toml --env production
```

Repite con `workers/admin-api/wrangler.toml` si el problema está en el admin.
`wrangler rollback` no ejecuta build ni migraciones — sólo cambia qué versión
ya compilada sirve el tráfico. Si el rollback exige un esquema D1 anterior que
ya no existe (migración fue aplicada y no es reversible), no reviertas el
Worker: corrige hacia adelante con un hotfix compatible con el esquema actual.

## 2. Rollback de Pages (`public-web` / `admin-web`)

Cloudflare Pages conserva cada despliegue como inmutable con su propia URL.

```powershell
npx wrangler pages deployment list --project-name <PAGES_PROJECT>
```

Para volver a servir un despliegue anterior en el dominio de producción:
1. Abre el dashboard de Pages → el proyecto → pestaña "Deployments".
2. Localiza el despliegue bueno anterior y usa "Rollback to this deployment"
   (o "Retry deployment" si Wrangler CLI no expone el rollback en tu versión).
3. Verifica que el despliegue restaurado sigue usando `--branch main` como
   production branch — nunca actives un rollback hacia un deployment de otra
   rama como production por error.

No existe comando de rollback vía CLI garantizado en todas las versiones de
Wrangler para Pages; si el dashboard no muestra la opción, vuelve a desplegar
manualmente el commit bueno conocido (`git worktree`/`git checkout` local,
nunca reescribir la rama compartida) con el mismo comando de build+deploy
documentado en `docs/deploy-cloudflare.md`.

## 3. D1: no hay "rollback" real de una migración aplicada

Una vez que `d1 migrations apply --remote` corrió una migración con éxito, no
existe un comando oficial de Cloudflare para revertirla automáticamente. El
único camino seguro es una **migración compensatoria nueva** que deshaga el
cambio (por ejemplo, un `ALTER TABLE ... DROP COLUMN` si el motor lo soporta,
o una migración de datos que restaure el valor anterior desde un respaldo).

Reglas para migraciones compensatorias:
- Nunca edites un archivo de migración ya aplicado en producción; crea uno
  nuevo con número siguiente.
- Antes de escribir la compensatoria, corre en remoto (sólo lectura):
  ```powershell
  npx wrangler d1 execute <PROYECTO>-db --remote --command "PRAGMA table_info(<tabla>)"
  npx wrangler d1 execute <PROYECTO>-db --remote --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id"
  ```
- Prueba la migración compensatoria primero contra una copia local (D1 local
  vía `wrangler d1 execute <PROYECTO>-db --local`) antes de aplicarla remoto.
- Después de aplicar cualquier migración (directa o compensatoria) en remoto,
  corre siempre:
  ```powershell
  npx wrangler d1 execute <PROYECTO>-db --remote --command "SELECT * FROM pragma_foreign_key_check"
  ```
  Si devuelve filas, hay violaciones de integridad referencial — no declares
  el rollback exitoso hasta que esta consulta regrese vacía.
- Vuelve a correr el preflight comercial (`scripts/lmwares-commercial-preflight.ps1`)
  y compara contra la evidencia guardada en el paso 0.

## 4. Cron / colas

El cron de reconciliación (`scheduled()` en `workers/public-api/src/index.ts`)
y la cola `FREE_JOBS_QUEUE` no tienen estado propio que revertir: son
disparadores que leen D1 en cada ejecución. Si un rollback de Worker está en
curso, no hace falta pausar el cron — la próxima ejecución simplemente usa el
código ya restaurado. Si el rollback es de datos (sección 3), sí pausa
temporalmente cualquier operación manual sobre esos registros hasta terminar
la migración compensatoria, para evitar que el cron reconcilie sobre datos a
medio corregir.

## 5. Verificación posterior obligatoria (para cualquier rollback)

1. `GET https://api.lmwares.com/health` → `200`.
2. Preflight comercial (`scripts/lmwares-commercial-preflight.ps1`) sin
   incoherencias nuevas respecto a la evidencia del paso 0.
3. `npm run release:validate` desde un checkout limpio del commit que quedó
   activo, para confirmar que build/tests/typecheck siguen verdes sobre lo
   que realmente está desplegado.
4. Registra en el runbook de operación (o en un issue) qué se revirtió, por
   qué y el resultado de esta verificación — nunca cierres un incidente sin
   esta evidencia.
