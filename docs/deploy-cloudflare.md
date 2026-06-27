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

```powershell
# Node 20+ ya instalado. Instalar pnpm (sin admin):
iwr https://get.pnpm.io/install.ps1 -useb | iex
```
**Gotcha Windows:** si después `pnpm` "no se reconoce", el instalador no dejó el
PATH. Arréglalo (agrega la carpeta del binario al PATH de usuario y de la sesión):
```powershell
$p=(gci "$env:LOCALAPPDATA\pnpm" -Recurse -Filter pnpm.exe -ErrorAction SilentlyContinue | select -First 1).DirectoryName; if($p){$env:Path="$p;$env:Path"; [Environment]::SetEnvironmentVariable("Path","$p;"+[Environment]::GetEnvironmentVariable("Path","User"),"User"); pnpm -v}
```
Reinicia VS Code para que las terminales nuevas tomen el PATH.

```powershell
pnpm install
pnpm dlx wrangler login
pnpm dlx wrangler whoami     # confirma cuenta
```

---

## 2. Base de datos (D1) y archivos (R2)

```powershell
pnpm dlx wrangler d1 create <PROYECTO>-db
#   → copia el database_id a los TRES wrangler.toml:
#     infra/d1/wrangler.toml, workers/public-api/wrangler.toml, workers/admin-api/wrangler.toml
#     (reemplaza REEMPLAZAR_CON_TU_DATABASE_ID). Mantén binding = "DB".

pnpm dlx wrangler r2 bucket create <PROYECTO>-media

# Crear tablas + datos demo en remoto (confirma con: y)
pnpm --filter @infra/d1 migrate:remote
pnpm --filter @infra/d1 seed:remote
```
> **Gotcha:** `pnpm-workspace.yaml` debe incluir `infra/*` (si no, `@infra/d1` no se
> encuentra). Ya viene incluido en esta plantilla.

---

## 3. Worker público

```powershell
pnpm --filter @workers/public-api run deploy
#   → anota la URL: https://<PROYECTO>-public-api.<SUB>.workers.dev
```
> **Gotcha:** usa `run deploy` (no `pnpm ... deploy`): `deploy` es un comando propio
> de pnpm y, sin `run`, no ejecuta tu script.

Verifícalo: abre `…workers.dev/publications` → debe devolver JSON con el seed.

---

## 4. Sitio público (Cloudflare Pages)

Crea `apps/public-web/.env` (solo valores PÚBLICOS):
```
VITE_PUBLIC_API_URL="https://<PROYECTO>-public-api.<SUB>.workers.dev"
VITE_TURNSTILE_SITE_KEY=""    # se llena en el paso 5
```
Permite el origen de Pages en el Worker: en `workers/public-api/wrangler.toml`,
`ALLOWED_ORIGINS = "http://localhost:5173,https://<PAGES_PUB>.pages.dev"`, y
re-despliega el Worker (`pnpm --filter @workers/public-api run deploy`).

```powershell
pnpm --filter @apps/public-web build
pnpm dlx wrangler pages deploy apps/public-web/dist --project-name <PAGES_PUB>
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
   pnpm dlx wrangler secret put TURNSTILE_SECRET_KEY
   cd ../..
   ```
4. Activa la verificación: en `workers/public-api/wrangler.toml` pon `TURNSTILE_DISABLED = "0"`.
5. Re-despliega Worker y frontend:
   ```powershell
   pnpm --filter @workers/public-api run deploy
   pnpm --filter @apps/public-web build
   pnpm dlx wrangler pages deploy apps/public-web/dist --project-name <PAGES_PUB>
   ```
Prueba: en `https://<PAGES_PUB>.pages.dev/contacto` envía el formulario → "¡Gracias!".

---

## 6. Sitio admin (Pages) + dominio propio

Crea `apps/admin-web/.env` (API en el MISMO origen que la SPA):
```
VITE_ADMIN_API_URL=""
```
```powershell
pnpm --filter @apps/admin-web build
pnpm dlx wrangler pages deploy apps/admin-web/dist --project-name <PAGES_ADMIN>
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
pnpm --filter @workers/admin-api run deploy
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
pnpm dlx wrangler d1 execute <PROYECTO>-db --remote --command "INSERT INTO admin_users (id, email, name, role, active, created_at) VALUES (lower(hex(randomblob(16))), '<EMAIL_ADMIN>', 'Admin', 'owner', 1, datetime('now')) ON CONFLICT(email) DO UPDATE SET role='owner', active=1"
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
| `pnpm` "no se reconoce"                             | PATH; ver paso 1. Reinicia VS Code.                                        |
| `ERR_PNPM_INVALID_DEPLOY_TARGET`                    | Usa `run deploy` (deploy es comando de pnpm).                              |
| `No projects matched the filters "@infra/d1"`       | Falta `infra/*` en `pnpm-workspace.yaml`.                                  |
| Turnstile **110200**                                | El hostname del sitio no está en el widget (agrega `.pages.dev`).         |
| `secret put` no pide valor / secreto en historial   | El valor va en el PROMPT, no en la línea del comando.                      |
| `env.routes` aparece como variable                  | `routes` quedó dentro de `[vars]`; muévelo arriba.                         |
| Subir imagen da **422**                             | Corregido: `position` usa `z.coerce.number()` en validation.              |
| `ERR_BLOCKED_BY_CLIENT` en preview de imagen        | Brave/adblock bloquea `workers.dev`. Baja shields o usa `MEDIA_BASE_URL`. |
| Pages `project create` da error `8000000`           | Transitorio; usa `pages deploy` y acepta "Create a new project".          |

---

> Plantilla limpia: reemplaza los marcadores con los valores de tu cuenta y dominio.
