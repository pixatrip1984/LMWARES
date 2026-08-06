<#
.SYNOPSIS
  Radar de solo lectura del pipeline comercial LMWares: que evaluar (Fase 0)
  y que arrancar (proyectos pagados listos para el agente constructor).

.DESCRIPTION
  Corre dos consultas de solo lectura contra D1 (via `wrangler d1 execute`):

  1. Intakes en `submitted` -- solicitudes nuevas que todavia no se han
     tomado a revision (Fase 0, sin costo). Incluye el brief de contacto/
     negocio para poder evaluar sin abrir el panel.
  2. Ordenes de trabajo Starter en `awaiting_provisioning` -- fase 1 ya
     pagada, proyecto aceptado, listas para que el operador enlace un
     proyecto real de Oracle y arranque con `lmwares-agent-runner`.

  No escribe nada. No dispara builds ni envia nada al cliente. Es solo
  para saber, de un vistazo, que sigue.

.PARAMETER Local
  Usa la base de datos D1 local (`--local`) en vez de la remota
  (`--remote`, comportamiento por defecto). Util para probar el script en
  desarrollo.

.EXAMPLE
  pwsh scripts/lmwares-commercial-pipeline-status.ps1

.EXAMPLE
  pwsh scripts/lmwares-commercial-pipeline-status.ps1 -Local
#>
[CmdletBinding()]
param(
  [switch]$Local
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$publicApiDir = Join-Path $repoRoot 'workers\public-api'

if (-not (Test-Path (Join-Path $publicApiDir 'wrangler.toml'))) {
  throw "No se encontro wrangler.toml en $publicApiDir. Corre este script desde el repo oracle."
}

$scopeFlag = if ($Local) { '--local' } else { '--remote' }
$envFlag = if ($Local) { @() } else { @('--env', 'production') }
$persistArgs = if ($Local) { @('--persist-to', (Join-Path $repoRoot '.wrangler\state')) } else { @() }

$pendingReviewSql = "SELECT id, plan, submitted_at, contact_name, contact_phone, business_name, business_summary, site_goal, style_preference FROM lmw_package_intakes WHERE status = 'submitted' ORDER BY submitted_at ASC;"

$readyToStartSql = "SELECT w.id AS work_order_id, w.status AS work_order_status, w.created_at, i.plan, i.contact_name, i.contact_phone, i.business_name, i.business_summary, i.site_goal, i.modules FROM lmw_starter_work_orders w JOIN lmw_package_intakes i ON i.id = w.intake_id WHERE w.status = 'awaiting_provisioning' ORDER BY w.created_at ASC;"

function Invoke-D1Query {
  param(
    [string]$Sql,
    [string]$Label
  )

  Write-Host ""
  Write-Host "== $Label ==" -ForegroundColor Cyan

  Push-Location $publicApiDir
  try {
    $output = npx wrangler d1 execute starter-db $scopeFlag @envFlag @persistArgs --command $Sql --json 2>&1
  } finally {
    Pop-Location
  }

  $jsonText = ($output -join "`n")
  try {
    $parsed = $jsonText | ConvertFrom-Json
  } catch {
    Write-Host $jsonText
    throw "No se pudo interpretar la respuesta de wrangler para '$Label'. Revisa el mensaje anterior."
  }

  $rows = @()
  foreach ($result in $parsed) {
    if ($result.results) { $rows += $result.results }
  }

  if ($rows.Count -eq 0) {
    Write-Host "  (vacio)" -ForegroundColor DarkGray
    return
  }

  $rows | Format-Table -AutoSize | Out-String | Write-Host
}

Invoke-D1Query -Sql $pendingReviewSql -Label 'Pendientes de evaluar (Fase 0, status = submitted)'
Invoke-D1Query -Sql $readyToStartSql -Label 'Listas para arrancar (fase 1 pagada, awaiting_provisioning)'

Write-Host ""
Write-Host 'Siguiente paso: usa este radar dentro de la sesion de Copilot para pedir un borrador de' -ForegroundColor Yellow
Write-Host 'oferta (Fase 0) o un packet.json inicial para lmwares-agent-runner (proyectos pagados).' -ForegroundColor Yellow
Write-Host 'Ver docs/LMWARES-COMMERCIAL-INTAKE-AUTOMATION-RUNBOOK.md.' -ForegroundColor Yellow
