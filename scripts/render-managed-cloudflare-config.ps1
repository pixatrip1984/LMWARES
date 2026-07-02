[CmdletBinding()]
param(
  [string]$Profile = "deploy/profiles/client.local.json",
  [string]$OutDir = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Resolve-ProjectPath([string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
  return Join-Path $Root $Path
}

function Escape-Toml($Value) {
  return ([string]$Value).Replace('\', '\\').Replace('"', '\"')
}

function Toml-String($Value) {
  return '"' + (Escape-Toml $Value) + '"'
}

function Toml-Array($Values) {
  $items = @($Values) | ForEach-Object { Toml-String $_ }
  return "[" + ($items -join ", ") + "]"
}

function Write-GeneratedFile([string]$Path, [string]$Content) {
  if ((Test-Path -LiteralPath $Path) -and (-not $Force)) {
    throw "Output already exists: $Path. Use -Force to overwrite."
  }
  Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
  Write-Host "[ok] wrote $Path"
}

$ProfilePath = Resolve-ProjectPath $Profile
if (-not (Test-Path -LiteralPath $ProfilePath)) { throw "Profile not found: $ProfilePath" }

$profileObject = Get-Content -LiteralPath $ProfilePath -Raw | ConvertFrom-Json
$slug = [string]$profileObject.client.slug
if ([string]::IsNullOrWhiteSpace($OutDir)) {
  $OutDir = Join-Path $Root ".deploy\$slug"
} elseif (-not [System.IO.Path]::IsPathRooted($OutDir)) {
  $OutDir = Join-Path $Root $OutDir
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$allowedOrigins = @($profileObject.runtime.allowedOrigins) -join ","
$adminEmails = @($profileObject.cloudflare.adminEmails) -join ","
$compatibilityDate = "2026-06-28"
$r2BucketName = [string]$profileObject.resources.r2BucketName

$publicWorkerToml = @"
name = "$($profileObject.resources.publicWorkerName)"
main = "../../workers/public-api/src/index.ts"
compatibility_date = "$compatibilityDate"
compatibility_flags = ["nodejs_compat"]
workers_dev = false
preview_urls = true

[[routes]]
pattern = "$($profileObject.hostnames.publicApi)"
custom_domain = true

[vars]
ALLOWED_ORIGINS = "$(Escape-Toml $allowedOrigins)"
MEDIA_BASE_URL = ""
PROJECT_SLUG = "$slug"
TURNSTILE_DISABLED = "0"

[secrets]
required = $(Toml-Array $profileObject.secrets.publicApi)

[[d1_databases]]
binding = "DB"
database_name = "$($profileObject.resources.d1DatabaseName)"
database_id = "$($profileObject.resources.d1DatabaseId)"
migrations_dir = "../../infra/d1/migrations"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "$r2BucketName"
"@

$adminWorkerToml = @"
name = "$($profileObject.resources.adminWorkerName)"
main = "../../workers/admin-api/src/index.ts"
compatibility_date = "$compatibilityDate"
compatibility_flags = ["nodejs_compat"]
workers_dev = false
preview_urls = true

[[routes]]
pattern = "$($profileObject.hostnames.adminApi)"
custom_domain = true

[vars]
ALLOWED_ORIGINS = "$(Escape-Toml $allowedOrigins)"
MEDIA_BASE_URL = ""
MEDIA_BUCKET_NAME = "$r2BucketName"
PUBLIC_API_URL = "https://$($profileObject.hostnames.publicApi)"
PROJECT_SLUG = "$slug"
ACCESS_TEAM_DOMAIN = "$($profileObject.cloudflare.accessTeamDomain)"
ACCESS_AUD = "$($profileObject.cloudflare.accessAud)"
ADMIN_EMAILS = "$(Escape-Toml $adminEmails)"
AUTO_PROVISION_ADMINS = "1"
ACCESS_DISABLED = "0"

[secrets]
required = $(Toml-Array $profileObject.secrets.adminApi)

[[d1_databases]]
binding = "DB"
database_name = "$($profileObject.resources.d1DatabaseName)"
database_id = "$($profileObject.resources.d1DatabaseId)"
migrations_dir = "../../infra/d1/migrations"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "$r2BucketName"
"@

$d1Toml = @"
name = "$($profileObject.resources.d1DatabaseName)"
compatibility_date = "$compatibilityDate"

[[d1_databases]]
binding = "DB"
database_name = "$($profileObject.resources.d1DatabaseName)"
database_id = "$($profileObject.resources.d1DatabaseId)"
migrations_dir = "../../infra/d1/migrations"
"@

$publicEnv = @"
VITE_PUBLIC_API_URL=https://$($profileObject.hostnames.publicApi)
VITE_TURNSTILE_SITE_KEY=$($profileObject.publicApp.turnstileSiteKey)
"@

$adminEnv = @"
VITE_ADMIN_API_URL=https://$($profileObject.hostnames.adminApi)
"@

$readme = @"
# Managed deploy artifacts for $($profileObject.client.name)

Generated from: $ProfilePath

These files are local artifacts. They must not be committed.

## Hosts

- Public app: https://$($profileObject.hostnames.public)
- Admin portal: https://$($profileObject.hostnames.portal)
- Public API: https://$($profileObject.hostnames.publicApi)
- Admin API: https://$($profileObject.hostnames.adminApi)

## Required secrets

Secrets are not rendered. Set them with Wrangler:

~~~powershell
npx --yes wrangler@4.105.0 secret put TURNSTILE_SECRET_KEY --config "$((Join-Path $OutDir "public-api.wrangler.toml"))"
~~~

## Suggested deploy sequence

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/managed-profile-audit.ps1 -Profile "$ProfilePath" -Strict
npx --yes wrangler@4.105.0 d1 migrations apply $($profileObject.resources.d1DatabaseName) --config "$((Join-Path $OutDir "infra-d1.wrangler.toml"))" --remote
npx --yes wrangler@4.105.0 deploy --config "$((Join-Path $OutDir "public-api.wrangler.toml"))"
npx --yes wrangler@4.105.0 deploy --config "$((Join-Path $OutDir "admin-api.wrangler.toml"))"

Copy-Item "$((Join-Path $OutDir "public-web.env.production"))" "apps/public-web/.env.production" -Force
npm run build --workspace @apps/public-web
npx --yes wrangler@4.105.0 pages deploy apps/public-web/dist --project-name "$($profileObject.resources.publicPagesProject)" --branch main

Copy-Item "$((Join-Path $OutDir "admin-web.env.production"))" "apps/admin-web/.env.production" -Force
npm run build --workspace @apps/admin-web
npx --yes wrangler@4.105.0 pages deploy apps/admin-web/dist --project-name "$($profileObject.resources.portalPagesProject)" --branch main
~~~

Do not run remote deploys until Access, Turnstile, D1, R2 and custom domains are configured.
"@

Write-GeneratedFile (Join-Path $OutDir "public-api.wrangler.toml") $publicWorkerToml
Write-GeneratedFile (Join-Path $OutDir "admin-api.wrangler.toml") $adminWorkerToml
Write-GeneratedFile (Join-Path $OutDir "infra-d1.wrangler.toml") $d1Toml
Write-GeneratedFile (Join-Path $OutDir "public-web.env.production") $publicEnv
Write-GeneratedFile (Join-Path $OutDir "admin-web.env.production") $adminEnv
Write-GeneratedFile (Join-Path $OutDir "README.md") $readme

Write-Host "[ok] render complete: $OutDir"
