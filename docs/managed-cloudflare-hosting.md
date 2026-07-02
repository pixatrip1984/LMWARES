# Cloudflare administrado bajo subdominios

Este starter soporta una fase de staging real sin comprar todavía el dominio del
cliente. La idea es operar cada proyecto bajo un subdominio administrado, por
ejemplo `lmwares.com`, validar infraestructura real y dejar el dominio final
para una fase posterior.

## Hostnames recomendados

Para un cliente con `slug = negocio`:

- `negocio.lmwares.com` - web publica.
- `portal-negocio.lmwares.com` - portal privado.
- `api-negocio.lmwares.com` - API publica.
- `admin-api-negocio.lmwares.com` - API privada.

## Aislamiento por cliente

No mezcles clientes en los mismos recursos:

- D1 remoto separado.
- R2 separado.
- Turnstile separado o, como minimo, hostnames exactos.
- Cloudflare Access app/policy separada para portal y API admin.
- Secretos por cliente.
- CORS con origenes exactos, nunca comodines.

## Perfil local

Genera un perfil local ignorado por Git:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/new-managed-client-profile.ps1 -ClientSlug negocio -ClientName "Negocio Cliente" -BaseDomain lmwares.com
```

Edita `deploy/profiles/negocio.local.json` con IDs no secretos. No pongas tokens
ni claves privadas en ese archivo.

Audita el perfil:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/managed-profile-audit.ps1 -Profile deploy/profiles/negocio.local.json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/managed-profile-audit.ps1 -Profile deploy/profiles/negocio.local.json -Strict
```

Renderiza artefactos locales:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/render-managed-cloudflare-config.ps1 -Profile deploy/profiles/negocio.local.json -Force
```

El render genera `.deploy/negocio/` con `wrangler.toml` de Workers, config D1 y
envs de produccion para las SPAs. `.deploy/` tambien esta ignorado por Git.

## Doctor de staging

Antes de desplegar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/managed-staging-doctor.ps1 -Profile deploy/profiles/negocio.local.json
```

El doctor no reemplaza la revision humana, pero detecta lo basico: tooling,
autenticacion de Wrangler, perfil, artefactos generados y siguientes pasos.

## Barrera comercial

Este staging permite que el cliente pruebe el producto con URLs reales y Access
sin exponer todavia el dominio final. El dominio del cliente, SEO, anuncios y
automatizaciones avanzadas pertenecen a una fase posterior.
