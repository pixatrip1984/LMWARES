#requires -Version 7.0

[CmdletBinding()]
param(
  [ValidateSet('local', 'remote')] [string]$Mode = 'local',
  [string]$ProjectId = 'astraeus',
  [string]$DevEmail = 'admin@example.com'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($Mode -eq 'remote' -and [string]::IsNullOrWhiteSpace($env:LMWARES_ACCESS_COOKIE)) {
  throw 'Remote validation requires LMWARES_ACCESS_COOKIE in the current process environment.'
}

$root = Split-Path -Parent $PSScriptRoot
$parameters = if ($Mode -eq 'remote') {
  @{
    PublicApiUrl = 'https://api.lmwares.com'
    AdminApiUrl = 'https://admin.lmwares.com'
    PublicOrigin = 'https://contratar.lmwares.com'
    AdminOrigin = 'https://admin.lmwares.com'
    ProjectId = $ProjectId
    DevEmail = $DevEmail
  }
} else {
  @{
    PublicApiUrl = 'http://127.0.0.1:8887'
    AdminApiUrl = 'http://127.0.0.1:8888'
    PublicOrigin = 'http://127.0.0.1:5273'
    AdminOrigin = 'http://127.0.0.1:5274'
    ProjectId = $ProjectId
    DevEmail = $DevEmail
  }
}

$validators = @(
  'validate-starter-blog.ps1',
  'validate-starter-galleries.ps1',
  'validate-starter-docs-isolation.ps1',
  'validate-starter-forms.ps1',
  'validate-starter-events.ps1'
)

foreach ($validator in $validators) {
  $path = Join-Path $root "scripts\$validator"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Validator not found: $path"
  }
  Write-Host ''
  Write-Host "=== $validator ($Mode) ===" -ForegroundColor Cyan
  & $path @parameters
}

Write-Host ''
Write-Host "All five Starter module validators passed in $Mode mode." -ForegroundColor Green
