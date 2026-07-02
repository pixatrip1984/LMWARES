# Checklist de seguridad

Refleja las reglas arquitectónicas de la plantilla. Revísalo antes de cada release.

## Arquitectura de acceso a datos

- [ ] **React nunca accede directo a D1 ni R2.** Toda E/S pasa por Workers.
- [ ] El **Public API** solo expone datos públicos (publicaciones `published`) y
      recibe formularios. No expone endpoints de administración.
- [ ] El **Admin API** valida la identidad de **Cloudflare Access** en `/admin/*`
      (JWT verificado con JWKS: firma, expiración y `aud`).
- [ ] Endpoints mutantes del admin exigen rol con permisos (`requireWrite`).

## Secretos y configuración

- [ ] **Ningún secreto en `VITE_*`** (todo lo `VITE_*` es público).
- [ ] `TURNSTILE_SECRET_KEY` solo como secreto del Worker, nunca en el front.
- [ ] `.dev.vars` y `.env` están en `.gitignore` (solo se versionan los `*.example`).
- [ ] Sin credenciales hardcodeadas en el código ni en los `wrangler.toml`.

## Anti-abuso y validación

- [ ] **Turnstile validado server-side** en `POST /requests` (no se confía en el cliente).
- [ ] Toda entrada se valida con esquemas Zod compartidos (`@starter/validation`).
- [ ] El token de Turnstile **no se persiste**.
- [ ] Límite de tamaño y tipo en subida de imágenes (`defaultProjectConfig.uploads`).

## CORS y superficie

- [ ] `ALLOWED_ORIGINS` restringido a los dominios reales (sin `*`).
- [ ] El Admin API usa `credentials: true` solo con orígenes explícitos.
- [ ] Endpoints de salud (`/health`) no filtran información sensible.

## Datos y trazabilidad

- [ ] Cambios de estado registran `status_history`.
- [ ] Acciones relevantes registran `audit_events` (quién, qué, cuándo).
- [ ] La auditoría no rompe la operación principal si falla (best-effort).
- [ ] Las imágenes en R2 usan keys generadas por `@starter/config` (sin colisiones).

## Antes de producción

- [ ] `ACCESS_DISABLED=0` y `TURNSTILE_DISABLED=0`.
- [ ] Revisar roles de `admin_users` (mínimo privilegio).
- [ ] Rotar/definir secretos de producción con `wrangler secret put`.
- [ ] Ejecutar pruebas del [adversarial-playbook.md](./adversarial-playbook.md).
- [ ] Si hay revision privada, usar datos de prueba hasta que el cliente apruebe operar datos reales.
