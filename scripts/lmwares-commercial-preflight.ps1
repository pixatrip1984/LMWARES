[CmdletBinding()]
param(
    [ValidateSet('Report', 'Commercial', 'Maintenance', 'All')]
    [string]$RequireReady = 'Report'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$workerConfig = Join-Path $repoRoot 'workers/public-api/wrangler.toml'
$d1Config = Join-Path $repoRoot 'infra/d1/wrangler.toml'

$commercialSecrets = @(
    'MERCADO_PAGO_COMMERCIAL_ACCESS_TOKEN',
    'MERCADO_PAGO_COMMERCIAL_WEBHOOK_SECRET'
)
$maintenanceSecrets = @(
    'MERCADO_PAGO_MAINTENANCE_ACCESS_TOKEN',
    'MERCADO_PAGO_MAINTENANCE_WEBHOOK_SECRET'
)

function Invoke-WranglerJson {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $output = & npx wrangler @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler falló al ejecutar una comprobación de sólo lectura.`n$($output -join [Environment]::NewLine)"
    }
    $json = ($output -join [Environment]::NewLine).Trim()
    try {
        return $json | ConvertFrom-Json
    } catch {
        throw 'Wrangler no devolvió JSON válido. No se inspeccionó ningún secreto.'
    }
}

function Read-Gate {
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Name
    )

    $pattern = '(?m)^{0}\s*=\s*"([01])"\s*$' -f [regex]::Escape($Name)
    $match = [regex]::Match($Source, $pattern)
    if (-not $match.Success) { return 'missing' }
    return $match.Groups[1].Value
}

function Test-SecretSet {
    param(
        [Parameter(Mandatory)][string[]]$Names,
        [Parameter(Mandatory)][object[]]$Available
    )

    $availableNames = @($Available | ForEach-Object { $_.name })
    return @($Names | Where-Object { $_ -notin $availableNames }).Count -eq 0
}

function Write-Check {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][bool]$Ok,
        [Parameter(Mandatory)][string]$Value
    )

    $status = if ($Ok) { 'OK' } else { 'FALTA' }
    Write-Output ("{0}={1} ({2})" -f $Name, $status, $Value)
}

Push-Location $repoRoot
try {
    $wranglerVersion = (& npx wrangler --version 2>&1 | Select-Object -Last 1).Trim()
    if ($LASTEXITCODE -ne 0 -or $wranglerVersion -notmatch '^4\.') {
        throw "Se requiere Wrangler 4.x; versión detectada: $wranglerVersion"
    }

    $secrets = @(Invoke-WranglerJson -Arguments @(
        'secret', 'list',
        '--config', $workerConfig,
        '--env', 'production',
        '--format', 'json'
    ))
    $configSource = Get-Content -LiteralPath $workerConfig -Raw
    $commercialGate = Read-Gate -Source $configSource -Name 'MERCADO_PAGO_COMMERCIAL_PAYMENTS_ENABLED'
    $maintenanceGate = Read-Gate -Source $configSource -Name 'MERCADO_PAGO_MAINTENANCE_SUBSCRIPTIONS_ENABLED'

    $db = @(Invoke-WranglerJson -Arguments @(
        'd1', 'execute', 'DB',
        '--remote',
        '--config', $d1Config,
        '--env', 'production',
        '--json',
        '--command', "SELECT name FROM d1_migrations WHERE name='0026_lmwares_maintenance_subscriptions.sql'; SELECT COUNT(*) AS fk_violations FROM pragma_foreign_key_check; SELECT COUNT(*) AS implementation_orders FROM lmw_billing_orders WHERE purpose='implementation'; SELECT COUNT(*) AS maintenance_subscriptions FROM lmw_maintenance_subscriptions; SELECT COUNT(*) AS paid_implementation_orders FROM lmw_billing_orders WHERE purpose='implementation' AND status='paid' AND payment_review_required=0; SELECT COUNT(*) AS maintenance_eligible_work_orders FROM lmw_starter_work_orders w JOIN lmw_billing_orders b ON b.id=w.billing_order_id JOIN lmw_commercial_offers o ON o.id=w.commercial_offer_id WHERE w.status='ready_to_publish' AND w.project_id IS NOT NULL AND b.status='paid' AND b.payment_review_required=0 AND o.status='accepted';"
    ))

    $health = Invoke-WebRequest -Uri 'https://api.lmwares.com/health' -UseBasicParsing -TimeoutSec 20
    $commercialReady = Test-SecretSet -Names $commercialSecrets -Available $secrets
    $maintenanceReady = Test-SecretSet -Names $maintenanceSecrets -Available $secrets
    $migrationReady = @($db[0].results).Count -eq 1
    $fkViolations = [int]$db[1].results[0].fk_violations
    $maintenanceEligibleWorkOrders = [int]$db[5].results[0].maintenance_eligible_work_orders
    $databaseReady = $migrationReady -and $fkViolations -eq 0

    Write-Output 'LMWARES_COMMERCIAL_PREFLIGHT'
    Write-Output "WRANGLER_VERSION=$wranglerVersion"
    Write-Check -Name 'PUBLIC_API' -Ok ($health.StatusCode -eq 200) -Value "HTTP $($health.StatusCode)"
    Write-Check -Name 'D1_MIGRATION_0026' -Ok $migrationReady -Value $(if ($migrationReady) { 'aplicada' } else { 'ausente' })
    Write-Check -Name 'D1_FOREIGN_KEYS' -Ok ($fkViolations -eq 0) -Value "$fkViolations violaciones"
    Write-Check -Name 'COMMERCIAL_SECRETS' -Ok $commercialReady -Value "$(@($commercialSecrets | Where-Object { $_ -in @($secrets.name) }).Count)/2 nombres presentes"
    Write-Check -Name 'MAINTENANCE_SECRETS' -Ok $maintenanceReady -Value "$(@($maintenanceSecrets | Where-Object { $_ -in @($secrets.name) }).Count)/2 nombres presentes"
    Write-Output "COMMERCIAL_GATE=$commercialGate"
    Write-Output "MAINTENANCE_GATE=$maintenanceGate"
    Write-Output "IMPLEMENTATION_ORDERS=$([int]$db[2].results[0].implementation_orders)"
    Write-Output "MAINTENANCE_SUBSCRIPTIONS=$([int]$db[3].results[0].maintenance_subscriptions)"
    Write-Output "PAID_IMPLEMENTATION_ORDERS=$([int]$db[4].results[0].paid_implementation_orders)"
    Write-Output "MAINTENANCE_ELIGIBLE_WORK_ORDERS=$maintenanceEligibleWorkOrders"
    Write-Output 'COMMERCIAL_WEBHOOK=https://api.lmwares.com/payments/webhooks/mercado-pago?scope=commercial'
    Write-Output 'MAINTENANCE_WEBHOOK=https://api.lmwares.com/payments/webhooks/mercado-pago?scope=maintenance'
    Write-Output 'SECRET_VALUES=not_read'

    $baseReady = $health.StatusCode -eq 200 -and $databaseReady
    $requiredReady = switch ($RequireReady) {
        'Commercial' { $baseReady -and $commercialReady }
        'Maintenance' { $baseReady -and $maintenanceReady -and $maintenanceEligibleWorkOrders -gt 0 }
        'All' { $baseReady -and $commercialReady -and $maintenanceReady -and $maintenanceEligibleWorkOrders -gt 0 }
        default { $baseReady }
    }
    if (-not $requiredReady) { exit 2 }
} finally {
    Pop-Location
}
