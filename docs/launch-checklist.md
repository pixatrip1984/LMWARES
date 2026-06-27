# Checklist de lanzamiento

Para llevar un proyecto basado en esta plantilla a producción.

## Recursos Cloudflare

- [ ] `wrangler d1 create <slug>-db` y `database_id` copiado en los 3 `wrangler.toml`.
- [ ] `wrangler r2 bucket create <slug>-media`.
- [ ] Migraciones aplicadas en remoto: `pnpm db:migrate:remote`.
- [ ] (Opcional) Seed/datos iniciales cargados.

## Cloudflare Access (portal admin)

- [ ] Aplicación de Access creada apuntando al dominio del admin-web.
- [ ] Política de acceso definida (emails/grupos autorizados).
- [ ] `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` configurados en admin-api.
- [ ] `ACCESS_DISABLED=0` en producción.
- [ ] AdminUser inicial con rol `owner` (o `AUTO_PROVISION_ADMINS` + ajuste de rol).

## Turnstile (formularios públicos)

- [ ] Widget de Turnstile creado; site key en `VITE_TURNSTILE_SITE_KEY`.
- [ ] `TURNSTILE_SECRET_KEY` cargado como secreto del public-api.
- [ ] `TURNSTILE_DISABLED=0` en producción.

## Workers

- [ ] `ALLOWED_ORIGINS` con los dominios reales (público y admin).
- [ ] `MEDIA_BASE_URL` apuntando al dominio/CDN de R2 (si se usa CDN).
- [ ] `pnpm --filter @workers/public-api run deploy`.
- [ ] `pnpm --filter @workers/admin-api run deploy`.

## Frontends (Cloudflare Pages)

- [ ] Proyecto Pages para public-web (build: `pnpm --filter @apps/public-web build`, salida `apps/public-web/dist`).
- [ ] Proyecto Pages para admin-web (salida `apps/admin-web/dist`).
- [ ] Variables `VITE_*` configuradas en cada Pages (apuntando a los Workers).
- [ ] admin-web protegido por la aplicación de Access.

## Verificación final

- [ ] `pnpm typecheck` y `pnpm build` sin errores.
- [ ] Flujo público: catálogo → detalle → envío de formulario (con Turnstile real).
- [ ] Flujo admin: login por Access → CRUD publicaciones → imágenes → solicitudes.
- [ ] CORS: el navegador no muestra errores entre frontends y Workers.
- [ ] Auditoría: los eventos se registran (revisa `/admin/audit`).
- [ ] Revisar [security-checklist.md](./security-checklist.md).
