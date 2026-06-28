[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [switch]$SkipSeed,
  [switch]$ResetLocalState
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$env:NPM_CONFIG_UPDATE_NOTIFIER = 'false'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked([string]$File, [string[]]$Arguments) {
  Write-Host "+ $File $($Arguments -join ' ')" -ForegroundColor DarkGray
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $File $($Arguments -join ' ')"
  }
}

function Copy-IfMissing([string]$Source, [string]$Destination) {
  if (-not (Test-Path -LiteralPath $Source)) {
    return
  }

  if (-not (Test-Path -LiteralPath $Destination)) {
    Copy-Item -LiteralPath $Source -Destination $Destination
    Write-Host "Created $Destination"
  } else {
    Write-Host "Exists  $Destination"
  }
}

function Assert-WritableRepo {
  $probeFile = Join-Path $Root '.tmp-write-probe'
  $probeDir = Join-Path $Root '.tmp-write-probe-dir'

  try {
    Set-Content -LiteralPath $probeFile -Value 'ok'
    New-Item -ItemType Directory -Path $probeDir -Force | Out-Null
  } catch {
    throw "This project path is not writable. Move the repo to C:\dev\<project> and try again. Original error: $($_.Exception.Message)"
  } finally {
    Remove-Item -LiteralPath $probeFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $probeDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  if ($Root -match '\\Documents\\') {
    Write-Warning "This repo is under Documents. Prefer C:\dev\<project> to avoid Windows sandbox/Controlled Folder Access issues."
  }
}

function Assert-Tooling {
  $node = Get-Command node -ErrorAction Stop
  $npm = Get-Command npm -ErrorAction Stop
  $nodeVersion = (& $node.Source -p "process.versions.node").Trim()
  $nodeMajor = [int]($nodeVersion.Split('.')[0])

  if ($nodeMajor -lt 20) {
    throw "Node 20+ is required. Current version: $nodeVersion"
  }

  Write-Host "Node $nodeVersion"
  Write-Host "npm  $((& $npm.Source --version).Trim())"
}

Write-Step "Preflight"
Assert-WritableRepo
Assert-Tooling

if ($ResetLocalState) {
  Write-Step "Reset local Wrangler state"
  $statePath = Join-Path $Root '.wrangler\state'
  if (Test-Path -LiteralPath $statePath) {
    Remove-Item -LiteralPath $statePath -Recurse -Force
    Write-Host "Removed $statePath"
  }
}

if (-not $SkipInstall) {
  Write-Step "Install npm workspace dependencies"
  Invoke-Checked 'npm' @('install', '--no-audit', '--no-fund', '--loglevel=notice')
}

Write-Step "Create local env files"
Copy-IfMissing '.env.example' '.env'
Copy-IfMissing 'apps/public-web/.env.example' 'apps/public-web/.env'
Copy-IfMissing 'apps/admin-web/.env.example' 'apps/admin-web/.env'
Copy-IfMissing 'workers/public-api/.dev.vars.example' 'workers/public-api/.dev.vars'
Copy-IfMissing 'workers/admin-api/.dev.vars.example' 'workers/admin-api/.dev.vars'

Write-Step "Apply local D1 migrations"
Invoke-Checked 'npm' @('run', 'db:migrate:local')

if (-not $SkipSeed) {
  Write-Step "Seed local D1"
  Invoke-Checked 'npm' @('run', 'db:seed:local')
}

Write-Step "Typecheck workspace"
Invoke-Checked 'npm' @('run', 'typecheck')

Write-Step "Bundle check Workers"
Invoke-Checked 'npm' @('run', 'check:workers')

Write-Step "Local setup complete"
Write-Host "Next: npm run dev:local"
Write-Host "Then: npm run validate:local"
