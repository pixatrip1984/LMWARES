# Checklist de lanzamiento y staging

Para llevar un proyecto basado en esta plantilla a una version revisable y luego
a produccion. La ruta recomendada es:

1. Staging administrado bajo subdominios, por ejemplo `lmwares.com`.
2. Validacion del cliente y cierre comercial.
3. Dominio final y lanzamiento publico.

El dominio final no es requisito para probar Workers, Pages, D1, R2, Turnstile,
Access y CORS con infraestructura real.

## Perfil administrado

- [ ] Slug definido (`<slug>`).
- [ ] Perfil local creado en `deploy/profiles/<slug>.local.json`.
- [ ] Perfil auditado sin placeholders criticos:
      `powershell -File scripts/managed-profile-audit.ps1 -Profile deploy/profiles/<slug>.local.json -Strict`.
- [ ] Artefactos generados en `.deploy/<slug>/`.
- [ ] `.deploy/` y `*.local.json` ignorados por Git.
- [ ] `managed-staging-doctor.ps1` ejecutado antes de deploy remoto.

## Recursos Cloudflare

- [ ] `wrangler d1 create <slug>-db` y `database_id` copiado en los 3 `wrangler.toml`.
- [ ] `wrangler r2 bucket create <slug>-media`.
- [ ] Migraciones aplicadas en remoto: `npm run db:migrate:remote`.
- [ ] (Opcional) Seed/datos iniciales cargados.

## Cloudflare Access (portal admin)

- [ ] Aplicación de Access creada apuntando al portal y al Admin API.
- [ ] Política de acceso definida (emails/grupos autorizados).
- [ ] `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` configurados en admin-api.
- [ ] `ACCESS_DISABLED=0` en producción.
- [ ] AdminUser inicial con rol `owner` (o `AUTO_PROVISION_ADMINS` + ajuste de rol).
- [ ] Preflight OPTIONS permitido o bypass OPTIONS configurado en Access para que CORS funcione.

## Turnstile (formularios públicos)

- [ ] Widget de Turnstile creado; site key en `VITE_TURNSTILE_SITE_KEY`.
- [ ] Hostnames agregados al widget: dominio de staging, Pages preview si aplica y `localhost` para pruebas.
- [ ] `TURNSTILE_SECRET_KEY` cargado como secreto del public-api.
- [ ] `TURNSTILE_DISABLED=0` en producción.

## Workers

- [ ] `ALLOWED_ORIGINS` con los dominios reales (público y admin).
- [ ] `MEDIA_BASE_URL` apuntando al dominio/CDN de R2 (si se usa CDN).
- [ ] `npm run deploy --workspace @workers/public-api`.
- [ ] `npm run deploy --workspace @workers/admin-api`.

## Frontends (Cloudflare Pages)

- [ ] Proyecto Pages para public-web (build: `npm run build --workspace @apps/public-web`, salida `apps/public-web/dist`).
- [ ] Proyecto Pages para admin-web (salida `apps/admin-web/dist`).
- [ ] Variables `VITE_*` configuradas en cada Pages (apuntando a los Workers).
- [ ] admin-web protegido por la aplicación de Access.
- [ ] Custom domains de staging activos: `<slug>.<base>` y `portal-<slug>.<base>`.

## Verificación final

- [ ] `npm run typecheck` y `npm run build` sin errores.
- [ ] Flujo público: catálogo → detalle → envío de formulario (con Turnstile real).
- [ ] Flujo admin: login por Access → CRUD publicaciones → imágenes → solicitudes.
- [ ] CORS: el navegador no muestra errores entre frontends y Workers.
- [ ] Auditoría: los eventos se registran (revisa `/admin/audit`).
- [ ] Revisar [security-checklist.md](./security-checklist.md).
- [ ] El cliente usa datos de prueba hasta aprobar operacion real.
