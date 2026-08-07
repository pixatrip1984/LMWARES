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
        '--command', "SELECT (SELECT COUNT(*) FROM d1_migrations WHERE name='0026_lmwares_maintenance_subscriptions.sql') AS migration_0026, (SELECT COUNT(*) FROM d1_migrations WHERE name='0031_lmwares_starter_client_projects.sql') AS migration_0031, (SELECT COUNT(*) FROM d1_migrations WHERE name='0032_lmwares_custom_domains.sql') AS migration_0032, (SELECT COUNT(*) FROM d1_migrations WHERE name='0033_lmwares_legacy_maintenance_selection_backfill.sql') AS migration_0033, (SELECT COUNT(*) FROM d1_migrations WHERE name='0034_lmwares_custom_domain_hostname_reuse.sql') AS migration_0034, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='lmw_starter_client_projects') AS starter_client_projects_table, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='lmw_custom_domains') AS custom_domains_table, (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_lmw_custom_domains_hostname_active') AS custom_domain_hostname_index, (SELECT COUNT(*) FROM pragma_foreign_key_check) AS fk_violations, (SELECT COUNT(*) FROM pragma_table_info('lmw_package_intakes') WHERE name='custom_domain_preference') AS package_domain_column, (SELECT COUNT(*) FROM pragma_table_info('lmw_package_intakes') WHERE name='maintenance_plan_preference') AS package_maintenance_column, (SELECT COUNT(*) FROM pragma_table_info('lmw_commercial_offers') WHERE name='maintenance_plan_selected') AS offer_plan_column, (SELECT COUNT(*) FROM lmw_billing_orders WHERE purpose='implementation') AS implementation_orders, (SELECT COUNT(*) FROM lmw_maintenance_subscriptions) AS maintenance_subscriptions, (SELECT COUNT(*) FROM lmw_billing_orders WHERE purpose='implementation' AND status='paid' AND payment_review_required=0) AS paid_implementation_orders, (SELECT COUNT(*) FROM lmw_starter_work_orders w JOIN lmw_billing_orders b ON b.id=w.billing_order_id JOIN lmw_commercial_offers o ON o.id=w.commercial_offer_id WHERE w.status='ready_to_publish' AND w.project_id IS NOT NULL AND b.status='paid' AND b.payment_review_required=0 AND o.status='accepted' AND o.monthly_amount_cents > 0) AS maintenance_eligible_work_orders, (SELECT COUNT(*) FROM lmw_commercial_offers o WHERE o.status IN ('issued','accepted') AND ((o.maintenance_plan_selected IS NULL AND o.monthly_amount_cents <> 0) OR (o.maintenance_plan_selected='none' AND o.monthly_amount_cents <> 0) OR (o.maintenance_plan_selected='basic' AND o.monthly_amount_cents <> 29900) OR (o.maintenance_plan_selected='advanced' AND o.monthly_amount_cents <> 59900) OR (o.maintenance_plan_selected IS NOT NULL AND o.maintenance_plan_selected NOT IN ('none','basic','advanced'))) AND o.is_test_data = 0) AS maintenance_offer_amount_mismatches, (SELECT COUNT(*) FROM lmw_starter_work_orders w JOIN lmw_billing_orders b ON b.id=w.billing_order_id JOIN lmw_commercial_offers o ON o.id=w.commercial_offer_id WHERE w.status='ready_to_publish' AND b.status='paid' AND b.payment_review_required=0 AND o.status='accepted' AND o.maintenance_plan_selected IS NULL AND o.is_test_data = 0) AS ready_to_publish_without_maintenance_decision, (SELECT COUNT(*) FROM lmw_starter_work_orders w JOIN lmw_billing_orders b ON b.id=w.billing_order_id JOIN lmw_commercial_offers o ON o.id=w.commercial_offer_id WHERE w.status='ready_to_publish' AND b.status='paid' AND b.payment_review_required=0 AND o.status='accepted' AND o.maintenance_plan_selected IN ('basic','advanced') AND NOT EXISTS (SELECT 1 FROM lmw_maintenance_subscriptions s WHERE s.work_order_id=w.id AND s.status='active')) AS ready_to_publish_without_active_maintenance, (SELECT COUNT(*) FROM lmw_custom_domains d WHERE d.status='active' AND (d.certificate_status <> 'active' OR NOT EXISTS (SELECT 1 FROM lmw_starter_client_projects p WHERE p.id=d.client_project_id AND p.user_id=d.user_id AND p.status='active'))) AS active_domains_without_certificate_or_project"
    ))
    if (@($db).Count -lt 1 -or @($db[0].results).Count -lt 1) {
        throw 'D1 no devolvió una fila de preflight. No se puede declarar el entorno listo.'
    }
    $dbRow = $db[0].results[0]

    $health = Invoke-WebRequest -Uri 'https://api.lmwares.com/health' -UseBasicParsing -TimeoutSec 20
    $commercialReady = Test-SecretSet -Names $commercialSecrets -Available $secrets
    $maintenanceReady = Test-SecretSet -Names $maintenanceSecrets -Available $secrets
    $migrationReady = [int]$dbRow.migration_0026 -eq 1
    $starterClientProjectSchemaReady =
        [int]$dbRow.migration_0031 -eq 1 -and
        [int]$dbRow.migration_0032 -eq 1 -and
        [int]$dbRow.migration_0034 -eq 1 -and
        [int]$dbRow.starter_client_projects_table -eq 1 -and
        [int]$dbRow.custom_domains_table -eq 1 -and
        [int]$dbRow.custom_domain_hostname_index -eq 1
    $legacyMaintenanceSelectionReady = [int]$dbRow.migration_0033 -eq 1
    $starterIntegrityRow = [pscustomobject]@{
        phase1_paid_without_client_project = -1
        client_projects_without_slug_reservation = -1
        active_domains_without_verification = -1
        active_maintenance_without_plan = -1
        maintenance_offer_amount_mismatches = -1
        ready_to_publish_without_maintenance_decision = -1
        ready_to_publish_without_active_maintenance = -1
        active_domains_without_certificate_or_project = -1
    }
    if ($starterClientProjectSchemaReady) {
        $integrity = @(Invoke-WranglerJson -Arguments @(
            'd1', 'execute', 'DB',
            '--remote',
            '--config', $d1Config,
            '--env', 'production',
            '--json',
            '--command', "SELECT (SELECT COUNT(*) FROM lmw_billing_orders b WHERE b.purpose='implementation' AND b.phase=1 AND b.status='paid' AND b.payment_review_required=0 AND b.intake_id IS NOT NULL AND b.commercial_offer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lmw_starter_work_orders w JOIN lmw_starter_client_projects p ON p.work_order_id=w.id WHERE w.billing_order_id=b.id)) AS phase1_paid_without_client_project, (SELECT COUNT(*) FROM lmw_starter_client_projects p LEFT JOIN lmw_slug_reservations r ON r.slug=p.slug WHERE r.slug IS NULL) AS client_projects_without_slug_reservation, (SELECT COUNT(*) FROM lmw_custom_domains WHERE status='active' AND verified_at IS NULL) AS active_domains_without_verification, (SELECT COUNT(*) FROM lmw_commercial_offers o JOIN lmw_maintenance_subscriptions s ON s.commercial_offer_id=o.id WHERE o.status='accepted' AND o.maintenance_plan_selected IS NULL AND s.status IN ('creating','creation_failed','pending_authorization','active','payment_attention','paused')) AS active_maintenance_without_plan, (SELECT COUNT(*) FROM lmw_commercial_offers o WHERE o.status IN ('issued','accepted') AND ((o.maintenance_plan_selected IS NULL AND o.monthly_amount_cents <> 0) OR (o.maintenance_plan_selected='none' AND o.monthly_amount_cents <> 0) OR (o.maintenance_plan_selected='basic' AND o.monthly_amount_cents <> 29900) OR (o.maintenance_plan_selected='advanced' AND o.monthly_amount_cents <> 59900) OR (o.maintenance_plan_selected IS NOT NULL AND o.maintenance_plan_selected NOT IN ('none','basic','advanced'))) AND o.is_test_data = 0) AS maintenance_offer_amount_mismatches, (SELECT COUNT(*) FROM lmw_starter_work_orders w JOIN lmw_billing_orders b ON b.id=w.billing_order_id JOIN lmw_commercial_offers o ON o.id=w.commercial_offer_id WHERE w.status='ready_to_publish' AND b.status='paid' AND b.payment_review_required=0 AND o.status='accepted' AND o.maintenance_plan_selected IS NULL AND o.is_test_data = 0) AS ready_to_publish_without_maintenance_decision, (SELECT COUNT(*) FROM lmw_starter_work_orders w JOIN lmw_billing_orders b ON b.id=w.billing_order_id JOIN lmw_commercial_offers o ON o.id=w.commercial_offer_id WHERE w.status='ready_to_publish' AND b.status='paid' AND b.payment_review_required=0 AND o.status='accepted' AND o.maintenance_plan_selected IN ('basic','advanced') AND NOT EXISTS (SELECT 1 FROM lmw_maintenance_subscriptions s WHERE s.work_order_id=w.id AND s.status='active')) AS ready_to_publish_without_active_maintenance, (SELECT COUNT(*) FROM lmw_custom_domains d WHERE d.status='active' AND (d.certificate_status <> 'active' OR NOT EXISTS (SELECT 1 FROM lmw_starter_client_projects p WHERE p.id=d.client_project_id AND p.user_id=d.user_id AND p.status='active'))) AS active_domains_without_certificate_or_project"
        ))
        if (@($integrity).Count -lt 1 -or @($integrity[0].results).Count -lt 1) {
            throw 'D1 no devolvió la fila de integridad Starter.'
        }
        $starterIntegrityRow = $integrity[0].results[0]
    }
    $schemaReady =
        [int]$dbRow.package_domain_column -eq 1 -and
        [int]$dbRow.package_maintenance_column -eq 1 -and
        [int]$dbRow.offer_plan_column -eq 1
    $fkViolations = [int]$dbRow.fk_violations
    $maintenanceEligibleWorkOrders = [int]$dbRow.maintenance_eligible_work_orders
    $phase1PaidWithoutClientProject = [int]$starterIntegrityRow.phase1_paid_without_client_project
    $clientProjectsWithoutSlugReservation = [int]$starterIntegrityRow.client_projects_without_slug_reservation
    $activeDomainsWithoutVerification = [int]$starterIntegrityRow.active_domains_without_verification
    $activeMaintenanceWithoutPlan = [int]$starterIntegrityRow.active_maintenance_without_plan
    $maintenanceOfferAmountMismatches = [int]$starterIntegrityRow.maintenance_offer_amount_mismatches
    $readyToPublishWithoutMaintenanceDecision = [int]$starterIntegrityRow.ready_to_publish_without_maintenance_decision
    $readyToPublishWithoutActiveMaintenance = [int]$starterIntegrityRow.ready_to_publish_without_active_maintenance
    $activeDomainsWithoutCertificateOrProject = [int]$starterIntegrityRow.active_domains_without_certificate_or_project
    $starterIntegrityReady =
        $starterClientProjectSchemaReady -and
        $phase1PaidWithoutClientProject -eq 0 -and
        $clientProjectsWithoutSlugReservation -eq 0 -and
        $activeDomainsWithoutVerification -eq 0 -and
        $activeMaintenanceWithoutPlan -eq 0 -and
        $maintenanceOfferAmountMismatches -eq 0 -and
        $readyToPublishWithoutMaintenanceDecision -eq 0 -and
        $readyToPublishWithoutActiveMaintenance -eq 0 -and
        $activeDomainsWithoutCertificateOrProject -eq 0
    $databaseReady =
        $migrationReady -and
        $legacyMaintenanceSelectionReady -and
        $starterIntegrityReady -and
        $schemaReady -and
        $fkViolations -eq 0

    Write-Output 'LMWARES_COMMERCIAL_PREFLIGHT'
    Write-Output "WRANGLER_VERSION=$wranglerVersion"
    Write-Check -Name 'PUBLIC_API' -Ok ($health.StatusCode -eq 200) -Value "HTTP $($health.StatusCode)"
    Write-Check -Name 'D1_MIGRATION_0026' -Ok $migrationReady -Value $(if ($migrationReady) { 'aplicada' } else { 'ausente' })
    Write-Check -Name 'D1_STARTER_CLIENT_SCHEMA' -Ok $starterClientProjectSchemaReady -Value $(if ($starterClientProjectSchemaReady) { '0031/0032/0034 aplicadas' } else { 'migraciones o tablas ausentes' })
    Write-Check -Name 'D1_MAINTENANCE_BACKFILL' -Ok $legacyMaintenanceSelectionReady -Value $(if ($legacyMaintenanceSelectionReady) { '0033 aplicada' } else { 'ausente' })
    Write-Check -Name 'D1_STARTER_INTEGRITY' -Ok $starterIntegrityReady -Value $(if ($starterIntegrityReady) { 'proyectos, reservas y dominios coherentes' } else { 'faltan proyectos, reservas o verificación de dominios' })
    Write-Check -Name 'D1_MAINTENANCE_OFFER_AMOUNTS' -Ok ($maintenanceOfferAmountMismatches -eq 0) -Value "$maintenanceOfferAmountMismatches incoherencias"
    Write-Check -Name 'D1_READY_WITHOUT_MAINTENANCE_DECISION' -Ok ($readyToPublishWithoutMaintenanceDecision -eq 0) -Value "$readyToPublishWithoutMaintenanceDecision órdenes"
    Write-Check -Name 'D1_READY_WITHOUT_ACTIVE_MAINTENANCE' -Ok ($readyToPublishWithoutActiveMaintenance -eq 0) -Value "$readyToPublishWithoutActiveMaintenance órdenes"
    Write-Check -Name 'D1_ACTIVE_DOMAINS_WITHOUT_CERTIFICATE_OR_PROJECT' -Ok ($activeDomainsWithoutCertificateOrProject -eq 0) -Value "$activeDomainsWithoutCertificateOrProject dominios"
    Write-Check -Name 'D1_COMMERCIAL_SCHEMA' -Ok $schemaReady -Value $(if ($schemaReady) { 'columnas presentes' } else { 'columnas ausentes' })
    Write-Check -Name 'D1_FOREIGN_KEYS' -Ok ($fkViolations -eq 0) -Value "$fkViolations violaciones"
    Write-Check -Name 'COMMERCIAL_SECRETS' -Ok $commercialReady -Value "$(@($commercialSecrets | Where-Object { $_ -in @($secrets.name) }).Count)/2 nombres presentes"
    Write-Check -Name 'MAINTENANCE_SECRETS' -Ok $maintenanceReady -Value "$(@($maintenanceSecrets | Where-Object { $_ -in @($secrets.name) }).Count)/2 nombres presentes"
    Write-Output "COMMERCIAL_GATE=$commercialGate"
    Write-Output "MAINTENANCE_GATE=$maintenanceGate"
    Write-Output "IMPLEMENTATION_ORDERS=$([int]$dbRow.implementation_orders)"
    Write-Output "MAINTENANCE_SUBSCRIPTIONS=$([int]$dbRow.maintenance_subscriptions)"
    Write-Output "PAID_IMPLEMENTATION_ORDERS=$([int]$dbRow.paid_implementation_orders)"
    Write-Output "MAINTENANCE_ELIGIBLE_WORK_ORDERS=$maintenanceEligibleWorkOrders"
    Write-Output "PHASE1_PAID_WITHOUT_CLIENT_PROJECT=$phase1PaidWithoutClientProject"
    Write-Output "CLIENT_PROJECTS_WITHOUT_SLUG_RESERVATION=$clientProjectsWithoutSlugReservation"
    Write-Output "ACTIVE_DOMAINS_WITHOUT_VERIFICATION=$activeDomainsWithoutVerification"
    Write-Output "ACTIVE_MAINTENANCE_WITHOUT_PLAN=$activeMaintenanceWithoutPlan"
    Write-Output "MAINTENANCE_OFFER_AMOUNT_MISMATCHES=$maintenanceOfferAmountMismatches"
    Write-Output "READY_TO_PUBLISH_WITHOUT_MAINTENANCE_DECISION=$readyToPublishWithoutMaintenanceDecision"
    Write-Output "READY_TO_PUBLISH_WITHOUT_ACTIVE_MAINTENANCE=$readyToPublishWithoutActiveMaintenance"
    Write-Output "ACTIVE_DOMAINS_WITHOUT_CERTIFICATE_OR_PROJECT=$activeDomainsWithoutCertificateOrProject"
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
