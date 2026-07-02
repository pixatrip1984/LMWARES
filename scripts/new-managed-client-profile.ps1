[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ClientSlug,

  [string]$ClientName = "",
  [string]$BaseDomain = "lmwares.com",
  [string]$AccountEmail = "lmwareservice@gmail.com",
  [string]$OutPath = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Fail([string]$Message) {
  throw "[fail] $Message"
}

function Normalize-Slug([string]$Value) {
  return $Value.Trim().ToLowerInvariant()
}

$slug = Normalize-Slug $ClientSlug
$domain = $BaseDomain.Trim().Trim(".").ToLowerInvariant()

if ($slug -notmatch '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$') {
  Fail "ClientSlug must be lowercase letters, numbers and dashes, 3-50 chars, without leading/trailing dash."
}

if ($domain -notmatch '^[a-z0-9.-]+\.[a-z]{2,}$') {
  Fail "BaseDomain must look like a real domain, for example lmwares.com."
}

if ([string]::IsNullOrWhiteSpace($ClientName)) {
  $ClientName = $slug
}

if ([string]::IsNullOrWhiteSpace($OutPath)) {
  $OutPath = Join-Path $Root "deploy\profiles\$slug.local.json"
} elseif (-not [System.IO.Path]::IsPathRooted($OutPath)) {
  $OutPath = Join-Path $Root $OutPath
}

if ((Test-Path -LiteralPath $OutPath) -and (-not $Force)) {
  Fail "Profile already exists: $OutPath. Use -Force to overwrite."
}

$publicHost = "$slug.$domain"
$portalHost = "portal-$slug.$domain"
$publicApiHost = "api-$slug.$domain"
$adminApiHost = "admin-api-$slug.$domain"

$profile = [ordered]@{
  schemaVersion = 1
  mode = "managed-subdomain"
  client = [ordered]@{
    slug = $slug
    name = $ClientName
  }
  cloudflare = [ordered]@{
    accountEmail = $AccountEmail
    accountId = "REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID"
    zoneName = $domain
    zoneId = "REPLACE_WITH_$($domain.ToUpperInvariant().Replace('.', '_'))_ZONE_ID"
    accessTeamDomain = "https://REPLACE.cloudflareaccess.com"
    accessAud = "REPLACE_WITH_ACCESS_AUD"
    adminEmails = @("admin@example.com")
  }
  hostnames = [ordered]@{
    public = $publicHost
    portal = $portalHost
    publicApi = $publicApiHost
    adminApi = $adminApiHost
  }
  resources = [ordered]@{
    publicWorkerName = "$slug-public-api"
    adminWorkerName = "$slug-admin-api"
    publicPagesProject = "$slug-public"
    portalPagesProject = "$slug-portal"
    d1DatabaseName = "$slug-db"
    d1DatabaseId = "REPLACE_WITH_D1_DATABASE_ID"
    r2BucketName = "$slug-media"
  }
  runtime = [ordered]@{
    appEnv = "staging"
    allowedOrigins = @("https://$publicHost", "https://$portalHost")
    submissionIpLimitPerHour = "60"
    submissionContactLimitPerHour = "6"
  }
  publicApp = [ordered]@{
    turnstileSiteKey = "REPLACE_WITH_TURNSTILE_SITE_KEY"
  }
  secrets = [ordered]@{
    publicApi = @("TURNSTILE_SECRET_KEY")
    adminApi = @()
  }
}

New-Item -ItemType Directory -Force -Path (Split-Path $OutPath) | Out-Null
$profile | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutPath -Encoding UTF8

Write-Host "[ok] managed client profile created: $OutPath"
Write-Host "[next] edit placeholders, then run:"
Write-Host "      powershell -NoProfile -ExecutionPolicy Bypass -File scripts/managed-profile-audit.ps1 -Profile `"$OutPath`""
Write-Host "      powershell -NoProfile -ExecutionPolicy Bypass -File scripts/render-managed-cloudflare-config.ps1 -Profile `"$OutPath`" -Force"
