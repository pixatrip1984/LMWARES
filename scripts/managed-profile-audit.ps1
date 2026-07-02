[CmdletBinding()]
param(
  [string]$Profile = "deploy/profiles/client.local.json",
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:Failures = @()
$script:Warnings = @()

function Resolve-ProjectPath([string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
  return Join-Path $Root $Path
}

function Add-Failure([string]$Message) {
  $script:Failures += $Message
  Write-Host "[fail] $Message"
}

function Add-Warning([string]$Message) {
  $script:Warnings += $Message
  Write-Host "[warn] $Message"
}

function Pass([string]$Message) {
  Write-Host "[ok] $Message"
}

function Is-Placeholder($Value) {
  if ($null -eq $Value) { return $true }
  $text = [string]$Value
  return [string]::IsNullOrWhiteSpace($text) -or $text -match 'REPLACE|example\.com|00000000-0000-0000-0000-000000000000'
}

function Assert-HostUnderZone([string]$Hostname, [string]$Zone, [string]$Label) {
  if (Is-Placeholder $Hostname) {
    Add-Failure "$Label hostname is missing"
    return
  }
  if ($Hostname -match 'localhost|127\.0\.0\.1|workers\.dev|pages\.dev') {
    Add-Failure "$Label hostname must be a managed custom hostname, got $Hostname"
    return
  }
  if ($Hostname -ne $Zone -and -not $Hostname.EndsWith(".$Zone")) {
    Add-Failure "$Label hostname $Hostname is outside zone $Zone"
    return
  }
  Pass "$Label hostname under $Zone"
}

$ProfilePath = Resolve-ProjectPath $Profile
if (-not (Test-Path -LiteralPath $ProfilePath)) {
  throw "Profile not found: $ProfilePath"
}

$raw = Get-Content -LiteralPath $ProfilePath -Raw
$profileObject = $raw | ConvertFrom-Json

Write-Host "Managed Cloudflare profile audit"
Write-Host "Profile: $ProfilePath"

if ($profileObject.schemaVersion -ne 1) { Add-Failure "schemaVersion must be 1" } else { Pass "schema version" }
if ($profileObject.mode -ne "managed-subdomain") { Add-Failure "mode must be managed-subdomain" } else { Pass "managed-subdomain mode" }

$slug = [string]$profileObject.client.slug
$zone = [string]$profileObject.cloudflare.zoneName

if ($slug -notmatch '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$') { Add-Failure "client.slug is invalid: $slug" } else { Pass "client slug" }
if ($zone -notmatch '^[a-z0-9.-]+\.[a-z]{2,}$') { Add-Failure "cloudflare.zoneName is invalid: $zone" } else { Pass "zone name" }

Assert-HostUnderZone ([string]$profileObject.hostnames.public) $zone "public"
Assert-HostUnderZone ([string]$profileObject.hostnames.portal) $zone "portal"
Assert-HostUnderZone ([string]$profileObject.hostnames.publicApi) $zone "public API"
Assert-HostUnderZone ([string]$profileObject.hostnames.adminApi) $zone "admin API"

$expectedOrigins = @(
  "https://$($profileObject.hostnames.public)",
  "https://$($profileObject.hostnames.portal)"
)
$actualOrigins = @($profileObject.runtime.allowedOrigins)
foreach ($origin in $expectedOrigins) {
  if ($actualOrigins -notcontains $origin) { Add-Failure "runtime.allowedOrigins must include $origin" } else { Pass "origin $origin" }
}

foreach ($origin in $actualOrigins) {
  if ($origin -match 'localhost|127\.0\.0\.1|\*') { Add-Failure "runtime.allowedOrigins contains unsafe origin $origin" }
}

$placeholderChecks = [ordered]@{
  "cloudflare.accountId" = $profileObject.cloudflare.accountId
  "cloudflare.zoneId" = $profileObject.cloudflare.zoneId
  "cloudflare.accessTeamDomain" = $profileObject.cloudflare.accessTeamDomain
  "cloudflare.accessAud" = $profileObject.cloudflare.accessAud
  "resources.d1DatabaseId" = $profileObject.resources.d1DatabaseId
  "resources.r2BucketName" = $profileObject.resources.r2BucketName
  "publicApp.turnstileSiteKey" = $profileObject.publicApp.turnstileSiteKey
}

foreach ($entry in $placeholderChecks.GetEnumerator()) {
  if (Is-Placeholder $entry.Value) {
    if ($Strict) {
      Add-Failure "$($entry.Key) is still a placeholder"
    } else {
      Add-Warning "$($entry.Key) is still a placeholder"
    }
  } else {
    Pass "$($entry.Key)"
  }
}

$adminEmails = @($profileObject.cloudflare.adminEmails)
$realAdminEmails = @($adminEmails | Where-Object { $_ -match '@' -and $_ -notmatch 'example\.com|REPLACE' })
if ($adminEmails.Count -eq 0 -or $realAdminEmails.Count -eq 0) {
  if ($Strict) { Add-Failure "cloudflare.adminEmails must include at least one real email" } else { Add-Warning "cloudflare.adminEmails has no real email yet" }
} else {
  Pass "admin emails"
}

if ($raw -match 'TURNSTILE_SECRET_KEY"\s*:\s*"[^"]+' -or $raw -match 'RETENTION_HASH_PEPPER"\s*:\s*"[^"]+') {
  Add-Failure "Profile must contain secret names only, never secret values."
}

$relativeProfile = Resolve-Path -Path $ProfilePath -Relative
$ignoreOutput = & git check-ignore $relativeProfile 2>$null
if ($LASTEXITCODE -eq 0) {
  Pass "local profile is ignored by git"
} elseif ($ProfilePath.EndsWith("client.example.json")) {
  Pass "example profile is versioned"
} else {
  Add-Warning "profile is not ignored by git; prefer deploy/profiles/*.local.json"
}

if ($Warnings.Count -gt 0) {
  Write-Host ""
  Write-Host "Warnings: $($Warnings.Count)"
}

if ($Failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Blocked: $($Failures.Count) profile issue(s) found."
  exit 1
}

Write-Host "Managed Cloudflare profile audit passed."
