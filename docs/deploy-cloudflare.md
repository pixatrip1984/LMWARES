# Guía completa de despliegue en Cloudflare

Guía reproducible de cero, para **cualquier cuenta y dominio**. Sirve tanto para
esta plantilla como para un proyecto nuevo clonado de ella.

Reemplaza los marcadores:

| Marcador            | Qué es                              | Ejemplo (este proyecto)                         |
| ------------------- | ----------------------------------- | ----------------------------------------------- |
| `<PROYECTO>`        | Slug del proyecto                   | `starter`                                       |
| `<DOMINIO>`         | Tu dominio (zona en Cloudflare)     | `ejemplo.com`                                    |
| `<SUB>`             | Subdominio workers.dev de tu cuenta | `tu-cuenta`                                  |
| `<DB_ID>`           | ID de la base D1                    | `682732b7-...-6789e491fe43`                      |
| `<PAGES_PUB>`       | Proyecto Pages público              | `miproyecto-public` → `miproyecto-public.pages.dev`    |
| `<PAGES_ADMIN>`     | Proyecto Pages admin                | `miproyecto-admin`                                  |
| `<EMAIL_ADMIN>`     | Tu correo de admin                  | `tu-correo@ejemplo.com`                        |
| `<AUD>`             | Application Audience tag de Access  | `f4e6439...0896a7d6`                             |
| `<TEAM>`            | Equipo de Zero Trust                | `ejemplo` → `tuequipo.cloudflareaccess.com`       |

> Convención de recursos: D1 = `<PROYECTO>-db`, R2 = `<PROYECTO>-media`,
> Worker público = `<PROYECTO>-public-api`, Worker admin = `<PROYECTO>-admin-api`.

---

## 0. Arquitectura (resumen)

- **Público:** `<PAGES_PUB>.pages.dev` (Pages) → `<PROYECTO>-public-api.<SUB>.workers.dev` (Worker) → D1/R2. Formulario protegido con Turnstile.
- **Admin:** `admin.<DOMINIO>` (Pages) sirve la SPA; el Worker admin atiende `admin.<DOMINIO>/admin/*` (misma URL) y está detrás de **Cloudflare Access**.

---

## 1. Requisitos (Windows)

Usa `C:\dev\<proyecto>` como ruta de trabajo. Evita `Documents`, OneDrive o
carpetas protegidas por Controlled Folder Access para no bloquear archivos
temporales de npm/Wrangler.

```powershell
npm install
npm run setup:local
npx wrangler@4.105.0 login
npx wrangler@4.105.0 whoami     # confirma cuenta
```

---

## 2. Base de datos (D1) y archivos (R2)

```powershell
npx wrangler@4.105.0 d1 create <PROYECTO>-db
#   → copia el database_id a los TRES wrangler.toml:
#     infra/d1/wrangler.toml, workers/public-api/wrangler.toml, workers/admin-api/wrangler.toml
#     (reemplaza 00000000-0000-0000-0000-000000000000). Mantén binding = "DB".

npx wrangler@4.105.0 r2 bucket create <PROYECTO>-media

# Crear tablas + datos demo en remoto (confirma con: y)
npm run migrate:remote --workspace @infra/d1
npm run seed:remote --workspace @infra/d1
```

---

## 3. Worker público

```powershell
npm run deploy --workspace @workers/public-api
#   → anota la URL: https://<PROYECTO>-public-api.<SUB>.workers.dev
```

Verifícalo: abre `…workers.dev/publications` → debe devolver JSON con el seed.

---

## 4. Sitio público (Cloudflare Pages)

Crea `apps/public-web/.env` (solo valores PÚBLICOS):
```
VITE_PUBLIC_API_URL="https://<PROYECTO>-public-api.<SUB>.workers.dev"
VITE_TURNSTILE_SITE_KEY=""    # se llena en el paso 5
```
Permite el origen de Pages en el Worker: en `workers/public-api/wrangler.toml`,
`ALLOWED_ORIGINS = "http://localhost:5273,https://<PAGES_PUB>.pages.dev"`, y
re-despliega el Worker (`npm run deploy --workspace @workers/public-api`).

```powershell
npm run build --workspace @apps/public-web
npx wrangler@4.105.0 pages deploy apps/public-web/dist --project-name <PAGES_PUB>
#   1ª vez: acepta "Create a new project", production branch = main
#   → URL de producción: https://<PAGES_PUB>.pages.dev   (NO la URL con hash)
```

---

## 5. Turnstile (proteger el formulario)

1. Dashboard → **Turnstile** → **Add widget**.
   - **Hostnames:** agrega AMBOS → `<PAGES_PUB>.pages.dev` **y** `localhost`, y **Guarda**.
     *(Gotcha: si falta el `.pages.dev`, el widget da error **110200** "dominio no permitido".)*
   - Modo **Managed**. Copia **Site Key** (pública) y **Secret Key** (privada).
2. Pon la Site Key en `apps/public-web/.env` → `VITE_TURNSTILE_SITE_KEY="0x...."`.
3. Carga el secreto en el Worker (el valor va en el PROMPT, **no** en la línea):
   ```powershell
   cd workers/public-api
   npx wrangler@4.105.0 secret put TURNSTILE_SECRET_KEY
   cd ../..
   ```
4. Activa la verificación: en `workers/public-api/wrangler.toml` pon `TURNSTILE_DISABLED = "0"`.
5. Re-despliega Worker y frontend:
   ```powershell
   npm run deploy --workspace @workers/public-api
   npm run build --workspace @apps/public-web
   npx wrangler@4.105.0 pages deploy apps/public-web/dist --project-name <PAGES_PUB>
   ```
Prueba: en `https://<PAGES_PUB>.pages.dev/contacto` envía el formulario → "¡Gracias!".

---

## 6. Sitio admin (Pages) + dominio propio

Crea `apps/admin-web/.env` (API en el MISMO origen que la SPA):
```
VITE_ADMIN_API_URL=""
```
```powershell
npm run build --workspace @apps/admin-web
npx wrangler@4.105.0 pages deploy apps/admin-web/dist --project-name <PAGES_ADMIN>
```
En el dashboard: **Workers & Pages** → proyecto `<PAGES_ADMIN>` → **Custom domains**
→ agrega `admin.<DOMINIO>` (crea solo el DNS proxied en tu zona).

---

## 7. Cloudflare Access (proteger el admin)

> Requiere que `<DOMINIO>` sea una **zona activa** en Cloudflare.

1. **Zero Trust** → si es 1ª vez, elige plan **Free** y un **team name** (`<TEAM>`),
   que define tu dominio de login `https://<TEAM>.cloudflareaccess.com`.
2. **Access** → **Applications** → **Add an application** → **Autoalojada y privada**
   → **DNS público** (es un hostname público proxied, no privado/túnel).
3. **Destino / Nombres de host públicos:** Subdominio `admin`, Dominio `<DOMINIO>`,
   Ruta vacía → `admin.<DOMINIO>`.
4. **Política:** Nombre `Allow me`, Acción **Permitir**, Include → **Emails** → `<EMAIL_ADMIN>`.
5. Login: deja **One-time PIN** (código al correo). Crea la app.
6. Abre la app → **Configuración adicional** → copia el **Application Audience (AUD) Tag**.

Datos que obtienes: `<AUD>` y `<TEAM>` (team domain).

---

## 8. Worker admin (Access + rutas)

En `workers/admin-api/wrangler.toml`:
- `ACCESS_TEAM_DOMAIN = "https://<TEAM>.cloudflareaccess.com"`
- `ACCESS_AUD = "<AUD>"`
- `ACCESS_DISABLED = "0"`
- `PUBLIC_API_URL = "https://<PROYECTO>-public-api.<SUB>.workers.dev"`  (previews de imagen)
- **`routes` al NIVEL SUPERIOR** (antes de `[vars]`):
  ```toml
  routes = [
    { pattern = "admin.<DOMINIO>/admin/*", zone_name = "<DOMINIO>" },
    { pattern = "admin.<DOMINIO>/health",  zone_name = "<DOMINIO>" }
  ]
  ```
  > **Gotcha clave:** si `routes` queda DENTRO de `[vars]`, wrangler lo trata como una
  > variable (`env.routes`) y **no aplica las rutas**. Debe ir arriba, antes de `[vars]`.

```powershell
npm run deploy --workspace @workers/admin-api
```
En la salida debe aparecer una sección con las rutas:
```
admin.<DOMINIO>/admin/* (zone name: <DOMINIO>)
admin.<DOMINIO>/health  (zone name: <DOMINIO>)
```
*(El warning de que se desactiva `workers.dev` es bueno: el admin solo queda accesible
vía `admin.<DOMINIO>` detrás de Access.)*

Date permisos de escritura (rol owner):
```powershell
cd infra/d1
npx wrangler@4.105.0 d1 execute <PROYECTO>-db --remote --command "INSERT INTO admin_users (id, email, name, role, active, created_at) VALUES (lower(hex(randomblob(16))), '<EMAIL_ADMIN>', 'Admin', 'owner', 1, datetime('now')) ON CONFLICT(email) DO UPDATE SET role='owner', active=1"
cd ../..
```

---

## 9. Verificación final

- Público: `https://<PAGES_PUB>.pages.dev` → catálogo + formulario (Turnstile) → "¡Gracias!".
- Admin: `https://admin.<DOMINIO>` → login de Access (código al correo) → panel
  (`<EMAIL_ADMIN> · owner`) → crear publicación, subir imagen, cambiar estado, ver solicitudes.
- Lo que publiques en el admin aparece en el catálogo público.

---

## 10. Tropiezos frecuentes (y solución)

| Síntoma                                             | Causa / Solución                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `ENOENT` creando `_tmp_*` o install colgado          | Mueve el repo a `C:\dev\<proyecto>` y vuelve a correr `npm run setup:local`. |
| Puerto LMWARES 5273/5274 ocupado                     | Detén el proceso que lo usa. Vite corre con `--strictPort` para fallar claro. |
| CORS bloquea localhost/127.0.0.1                     | Revisa `ALLOWED_ORIGINS` en ambos `wrangler.toml`.                          |
| Turnstile **110200**                                | El hostname del sitio no está en el widget (agrega `.pages.dev`).         |
| `secret put` no pide valor / secreto en historial   | El valor va en el PROMPT, no en la línea del comando.                      |
| `env.routes` aparece como variable                  | `routes` quedó dentro de `[vars]`; muévelo arriba.                         |
| Subir imagen da **422**                             | Corregido: `position` usa `z.coerce.number()` en validation.              |
| `ERR_BLOCKED_BY_CLIENT` en preview de imagen        | Brave/adblock bloquea `workers.dev`. Baja shields o usa `MEDIA_BASE_URL`. |
| Pages `project create` da error `8000000`           | Transitorio; usa `pages deploy` y acepta "Create a new project".          |

### D1: migración pendiente con columna ya existente

Si `d1 migrations apply --remote` marca una migración como pendiente pero
falla con `duplicate column name`, no vuelvas a ejecutar el `ALTER TABLE` ni
modifiques una migración histórica. Primero comprueba en remoto que la columna
ya existe y revisa el ledger:

```powershell
npx wrangler d1 execute <PROYECTO>-db --remote --command "PRAGMA table_info(<tabla>)"
npx wrangler d1 execute <PROYECTO>-db --remote --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id"
```

Sólo si el esquema coincide exactamente con la migración, registra ese archivo
como aplicado y continúa con Wrangler:

```powershell
npx wrangler d1 execute <PROYECTO>-db --remote --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('<MIGRACION>.sql')"
npx wrangler d1 migrations apply <PROYECTO>-db --remote
```

Este ajuste sólo corrige el historial; no sustituye la migración ni debe usarse
para saltar cambios que todavía no existan en el esquema. Después ejecuta
`PRAGMA foreign_key_check` y el preflight del proyecto.

---

> Plantilla limpia: reemplaza los marcadores con los valores de tu cuenta y dominio.
