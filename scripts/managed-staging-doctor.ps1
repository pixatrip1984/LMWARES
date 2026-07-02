[CmdletBinding()]
param(
  [string]$Profile = "deploy/profiles/client.local.json",
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Resolve-ProjectPath([string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
  return Join-Path $Root $Path
}

Write-Step "Tooling"
$node = (& node -v).Trim()
$npm = (& npm -v).Trim()
Write-Host "Node $node"
Write-Host "npm  $npm"

$wranglerVersion = (& npx --yes wrangler@4.105.0 --version).Trim()
Write-Host $wranglerVersion

Write-Step "Cloudflare auth"
$token = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "Process")
if (-not $token) { $token = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "User") }
if ($token) {
  Write-Host "[ok] CLOUDFLARE_API_TOKEN is available in the environment"
} else {
  Write-Host "[warn] CLOUDFLARE_API_TOKEN is not set; Wrangler may still work if logged in interactively"
}

& npx --yes wrangler@4.105.0 whoami
if ($LASTEXITCODE -ne 0 -and $Strict) {
  throw "Wrangler is not authenticated."
}

Write-Step "Profile"
$profilePath = Resolve-ProjectPath $Profile
if (-not (Test-Path -LiteralPath $profilePath)) {
  throw "Profile not found: $profilePath"
}

$auditArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/managed-profile-audit.ps1", "-Profile", $profilePath)
if ($Strict) {
  $auditArgs += "-Strict"
}

& powershell @auditArgs
if ($LASTEXITCODE -ne 0) {
  throw "Managed profile audit failed."
}

$profileObject = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
$deployDir = Join-Path $Root ".deploy\$($profileObject.client.slug)"

Write-Step "Generated artifacts"
if (Test-Path -LiteralPath $deployDir) {
  Write-Host "[ok] found $deployDir"
} else {
  Write-Host "[warn] missing $deployDir; run powershell -NoProfile -ExecutionPolicy Bypass -File scripts/render-managed-cloudflare-config.ps1 -Profile `"$profilePath`" -Force"
}

Write-Step "Next checks"
Write-Host "1. Confirm Access app protects https://$($profileObject.hostnames.portal) and https://$($profileObject.hostnames.adminApi)."
Write-Host "2. Confirm Turnstile hostnames include $($profileObject.hostnames.public), the Pages preview, and localhost if needed."
Write-Host "3. Confirm CORS allows exact origins only: $(@($profileObject.runtime.allowedOrigins) -join ', ')."
Write-Host "4. Run remote migrations, deploy Workers, deploy Pages, then smoke test health and a real form submission."
