[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Name,

  [string]$TargetRoot = 'C:\dev',
  [string]$RepoUrl = 'https://github.com/pixatrip1984/cloudflare-starter.git',
  [string]$Branch = 'cloudflare-starter-v01',
  [switch]$NoSetup,
  [switch]$KeepGitOrigin
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked([string]$File, [string[]]$Arguments) {
  Write-Host "+ $File $($Arguments -join ' ')" -ForegroundColor DarkGray
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $File $($Arguments -join ' ')"
  }
}

New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
$target = Join-Path $TargetRoot $Name

if (Test-Path -LiteralPath $target) {
  throw "Target already exists: $target"
}

$probe = Join-Path $TargetRoot '.tmp-new-project-probe'
try {
  Set-Content -LiteralPath $probe -Value 'ok'
} finally {
  Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
}

Invoke-Checked 'git' @('clone', '--branch', $Branch, $RepoUrl, $target)
Set-Location $target

if (-not $KeepGitOrigin) {
  Invoke-Checked 'git' @('remote', 'remove', 'origin')
}

if (-not $NoSetup) {
  & .\scripts\local-setup.ps1
  if ($LASTEXITCODE -ne 0) {
    throw "Local setup failed."
  }
}

Write-Host ''
Write-Host "Project ready: $target" -ForegroundColor Cyan
Write-Host "Next:"
Write-Host "  cd $target"
Write-Host "  npm run dev:local"
Write-Host "  npm run validate:local"
