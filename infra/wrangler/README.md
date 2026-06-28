# infra/wrangler — Convenciones de configuración y despliegue

## Recursos y nombres (sugeridos)

| Recurso        | Nombre              | Binding |
| -------------- | ------------------- | ------- |
| D1 database    | `starter-db`        | `DB`    |
| R2 bucket      | `starter-media`     | `MEDIA` |
| Worker público | `starter-public-api`| —       |
| Worker admin   | `starter-admin-api` | —       |

Para un proyecto nuevo, reemplaza el prefijo `starter-` por el slug del proyecto
(p.ej. `acme-db`, `acme-media`).

## Variables vs. secretos

- **`[vars]` en wrangler.toml**: configuración NO sensible (orígenes CORS,
  `MEDIA_BASE_URL`, `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`). Se versiona.
- **Secretos** (`wrangler secret put NOMBRE`): valores sensibles como
  `TURNSTILE_SECRET_KEY`. NUNCA en wrangler.toml ni en `VITE_*`.
- **Local**: usa `.dev.vars` (copia de `.dev.vars.example`). Está en `.gitignore`.

## Despliegue

```bash
# Workers
npm run deploy --workspace @workers/public-api
npm run deploy --workspace @workers/admin-api

# Secretos (remoto)
cd workers/public-api && npx wrangler@4.105.0 secret put TURNSTILE_SECRET_KEY
```

## Bindings compartidos

Ambos Workers declaran el MISMO `database_id` (D1) y bucket (R2) en su
`wrangler.toml`. La base se gestiona desde `infra/d1`.
