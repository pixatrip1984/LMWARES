[CmdletBinding()]
param(
  [switch]$SkipPortCheck
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

function Get-PortOwner([int]$Port) {
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
    [pscustomobject]@{
      Port = $Port
      ProcessId = $connection.OwningProcess
      CommandLine = $process.CommandLine
    }
  }
}

function Assert-PortFree([int]$Port) {
  $owners = @(Get-PortOwner $Port)
  if ($owners.Count -gt 0) {
    $details = ($owners | Format-Table -AutoSize | Out-String).Trim()
    throw "Port $Port is already in use.`n$details`nStop that process or change the dev port intentionally."
  }
}

if (-not $SkipPortCheck) {
  Write-Host "Checking local dev ports..."
  foreach ($port in @(8787, 8788, 5173, 5174)) {
    Assert-PortFree $port
  }
}

Write-Host ''
Write-Host 'Starting local stack:' -ForegroundColor Cyan
Write-Host '  Public API : http://localhost:8787'
Write-Host '  Admin API  : http://localhost:8788'
Write-Host '  Public web : http://127.0.0.1:5173'
Write-Host '  Admin web  : http://127.0.0.1:5174'
Write-Host ''
Write-Host 'Press Ctrl+C to stop all services.'
Write-Host ''

& npm run dev
if ($LASTEXITCODE -ne 0) {
  throw "Local dev stack exited with code $LASTEXITCODE"
}
