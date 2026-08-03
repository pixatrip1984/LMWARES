#requires -Version 7.0

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$validationParent = [IO.Path]::GetFullPath((Join-Path $workspace '.codex-dev\maintenance-policy-validation'))
$persistPath = Join-Path $validationParent ([guid]::NewGuid().ToString('N'))
$configPath = Join-Path $workspace 'infra\d1\wrangler.toml'
$fixturePath = Join-Path $PSScriptRoot 'fixtures\lmwares-maintenance-policy.sql'
$repositoryPath = Join-Path $workspace 'packages\db\src\repositories\lmwares-maintenance-subscriptions.ts'

function Invoke-Wrangler {
  param([Parameter(Mandatory)] [string[]]$Arguments, [switch]$Json)
  $output = & npx wrangler @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Wrangler falló con código $LASTEXITCODE." }
  if ($Json) { return ($output -join "`n") | ConvertFrom-Json }
  return $output
}

function Invoke-D1Json {
  param([Parameter(Mandatory)] [string]$Sql)
  $singleLineSql = ($Sql -replace '\r?\n', ' ').Trim()
  $response = Invoke-Wrangler -Json -Arguments @(
    'd1', 'execute', 'starter-db', '--local', '--persist-to', $persistPath,
    '--config', $configPath, '--command', $singleLineSql, '--json'
  )
  if (-not $response[0].success) { throw 'D1 devolvió success=false.' }
  return $response[0].results
}

function Assert-Equal {
  param($Actual, $Expected, [Parameter(Mandatory)] [string]$Message)
  if ($Actual -ne $Expected) { throw "$Message Esperado=$Expected Actual=$Actual" }
}

$resolvedParent = [IO.Path]::GetFullPath($validationParent)
if (-not $resolvedParent.StartsWith($workspace.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'La ruta temporal salió del workspace.'
}

try {
  New-Item -ItemType Directory -Force -Path $persistPath | Out-Null
  Write-Host 'Aplicando migraciones en D1 local aislado...'
  $null = Invoke-Wrangler -Arguments @(
    'd1', 'migrations', 'apply', 'starter-db', '--local', '--persist-to', $persistPath,
    '--config', $configPath
  )
  Write-Host 'Cargando escenario comercial sintético...'
  $null = Invoke-Wrangler -Arguments @(
    'd1', 'execute', 'starter-db', '--local', '--persist-to', $persistPath,
    '--config', $configPath, '--file', $fixturePath
  )

  $repositorySource = Get-Content -LiteralPath $repositoryPath -Raw
  foreach ($requiredClause in @(
    "w.status = 'ready_to_publish'",
    'w.project_id IS NOT NULL',
    "b.status = 'paid'",
    'b.payment_review_required = 0',
    "o.status = 'accepted'",
    'o.monthly_amount_cents > 0'
  )) {
    if (-not $repositorySource.Contains($requiredClause)) {
      throw "El repositorio perdió la compuerta: $requiredClause"
    }
  }

  Write-Host 'Comprobando elegibilidad...'
  $eligibility = Invoke-D1Json @'
SELECT w.id,
  CASE WHEN w.status = 'ready_to_publish'
    AND w.project_id IS NOT NULL
    AND b.status = 'paid'
    AND b.payment_review_required = 0
    AND o.status = 'accepted'
    AND o.monthly_amount_cents > 0
  THEN 1 ELSE 0 END AS eligible
FROM lmw_starter_work_orders w
JOIN lmw_billing_orders b ON b.id = w.billing_order_id
JOIN lmw_commercial_offers o ON o.id = w.commercial_offer_id
ORDER BY w.id;
'@
  $eligibilityById = @{}
  foreach ($row in $eligibility) { $eligibilityById[$row.id] = [int]$row.eligible }
  Assert-Equal $eligibilityById['work-good'] 1 'La orden válida debe ser elegible.'
  foreach ($blocked in @('work-no-project', 'work-unpaid', 'work-review', 'work-offer', 'work-building')) {
    Assert-Equal $eligibilityById[$blocked] 0 "La orden $blocked no debe ser elegible."
  }

  $claimSql = @'
INSERT OR IGNORE INTO lmw_maintenance_subscriptions
  (id, work_order_id, intake_id, commercial_offer_id, user_id, status,
   amount_cents, currency, frequency, frequency_type, pricing_version,
   subscription_snapshot, provider, external_reference, created_at, updated_at)
SELECT 'maintenance-good', w.id, w.intake_id, w.commercial_offer_id, w.user_id, 'creating',
       o.monthly_amount_cents, o.currency, 1, 'months', 'fixture-v1', '{}',
       'mercado_pago', 'lmw-maintenance:maintenance-good',
       '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'
FROM lmw_starter_work_orders w
JOIN lmw_billing_orders b ON b.id = w.billing_order_id
JOIN lmw_commercial_offers o ON o.id = w.commercial_offer_id
WHERE w.id = 'work-good' AND w.user_id = 'maintenance-user'
  AND w.status = 'ready_to_publish' AND w.project_id IS NOT NULL
  AND b.status = 'paid' AND b.payment_review_required = 0
  AND o.status = 'accepted' AND o.monthly_amount_cents > 0;
'@
  Write-Host 'Comprobando reclamación idempotente...'
  $null = Invoke-D1Json $claimSql
  $null = Invoke-D1Json ($claimSql.Replace("'maintenance-good'", "'maintenance-duplicate'").Replace("lmw-maintenance:maintenance-good", "lmw-maintenance:maintenance-duplicate"))
  $claimed = Invoke-D1Json "SELECT COUNT(*) AS total FROM lmw_maintenance_subscriptions WHERE work_order_id = 'work-good';"
  Assert-Equal ([int]$claimed[0].total) 1 'La reclamación debe ser idempotente por orden de trabajo.'

  Write-Host 'Comprobando publicación condicionada...'
  $null = Invoke-D1Json "UPDATE lmw_maintenance_subscriptions SET status='active', provider_preapproval_id='preapproval-fixture', authorization_url='https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=fixture' WHERE id='maintenance-good';"
  $null = Invoke-D1Json @'
UPDATE lmw_starter_work_orders
SET status = 'live', published_url = 'https://fixture.lmwares.com',
    published_at = '2026-08-03T00:05:00.000Z', updated_at = '2026-08-03T00:05:00.000Z'
WHERE id = 'work-good' AND status = 'ready_to_publish' AND project_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM lmw_maintenance_subscriptions s
    WHERE s.work_order_id = lmw_starter_work_orders.id AND s.status = 'active'
  );
'@
  $publication = Invoke-D1Json "SELECT status, published_url FROM lmw_starter_work_orders WHERE id='work-good';"
  Assert-Equal $publication[0].status 'live' 'La orden con mensualidad activa debe publicar.'
  Assert-Equal $publication[0].published_url 'https://fixture.lmwares.com' 'La URL publicada debe persistir.'

  $blockedPublication = Invoke-D1Json "SELECT COUNT(*) AS total FROM lmw_starter_work_orders WHERE id <> 'work-good' AND status='live';"
  Assert-Equal ([int]$blockedPublication[0].total) 0 'Ninguna orden sin mensualidad activa debe publicar.'

  $chargeSql = @'
INSERT INTO lmw_maintenance_subscription_charges
  (id, maintenance_subscription_id, provider, provider_authorized_payment_id,
   provider_payment_id, status, summarized, amount_cents, currency,
   debit_date, retry_attempt, created_at, updated_at)
VALUES ('charge-fixture', 'maintenance-good', 'mercado_pago', 'authorized-payment-fixture',
  'payment-fixture', 'scheduled', 'pending', 500, 'MXN', '2026-09-03', 0,
  '2026-08-03T00:10:00.000Z', '2026-08-03T00:10:00.000Z')
ON CONFLICT(provider_authorized_payment_id) DO UPDATE SET
  provider_payment_id = excluded.provider_payment_id,
  status = excluded.status,
  summarized = excluded.summarized,
  debit_date = excluded.debit_date,
  retry_attempt = excluded.retry_attempt,
  updated_at = excluded.updated_at
WHERE lmw_maintenance_subscription_charges.maintenance_subscription_id = excluded.maintenance_subscription_id;
'@
  Write-Host 'Comprobando reconciliación idempotente de cargos...'
  $null = Invoke-D1Json $chargeSql
  $null = Invoke-D1Json ($chargeSql.Replace("'scheduled', 'pending'", "'processed', 'approved'").Replace("'2026-09-03', 0", "'2026-09-03', 1"))
  $charge = Invoke-D1Json "SELECT COUNT(*) AS total, MAX(status) AS status, MAX(retry_attempt) AS retry_attempt FROM lmw_maintenance_subscription_charges WHERE provider_authorized_payment_id='authorized-payment-fixture';"
  Assert-Equal ([int]$charge[0].total) 1 'El cargo reconciliado debe ser idempotente.'
  Assert-Equal $charge[0].status 'processed' 'El reintento debe actualizar el cargo existente.'
  Assert-Equal ([int]$charge[0].retry_attempt) 1 'El reintento actualizado debe persistir.'

  Write-Host 'Comprobando que una cancelación sea terminal ante carreras...'
  $null = Invoke-D1Json "UPDATE lmw_maintenance_subscriptions SET status='canceled', canceled_at='2026-08-03T00:20:00.000Z' WHERE id='maintenance-good';"
  $null = Invoke-D1Json @'
UPDATE lmw_maintenance_subscriptions
SET status = CASE WHEN status IN ('canceled', 'disputed') THEN status ELSE 'active' END,
    provider_status = 'authorized',
    authorized_at = CASE
      WHEN status NOT IN ('canceled', 'disputed') AND 'active' = 'active'
      THEN COALESCE(authorized_at, '2026-08-03T00:21:00.000Z') ELSE authorized_at END,
    updated_at = '2026-08-03T00:21:00.000Z'
WHERE id = 'maintenance-good';
'@
  $terminal = Invoke-D1Json "SELECT status, CAST(strftime('%s', canceled_at) AS INTEGER) AS canceled_epoch FROM lmw_maintenance_subscriptions WHERE id='maintenance-good';"
  Assert-Equal $terminal[0].status 'canceled' 'Una conciliación concurrente no debe reabrir una mensualidad cancelada.'
  $expectedCanceledAt = [DateTimeOffset]::Parse('2026-08-03T00:20:00.000Z').ToUnixTimeSeconds()
  Assert-Equal ([long]$terminal[0].canceled_epoch) $expectedCanceledAt 'La evidencia de cancelación debe conservarse.'

  Write-Host 'Comprobando recuperación idempotente del comprobante publicado...'
  $notificationSql = @'
INSERT OR IGNORE INTO lmw_notifications
  (id, user_id, intake_id, channel, template, to_address, dedupe_key,
   status, attempt, max_attempts, next_attempt_at, payload, created_at, updated_at)
SELECT 'notification-fixture', w.user_id, NULL, 'email', 'starter-site-published', u.email,
       'starter-site-published:' || w.id, 'pending', 0, 5,
       '2026-08-03T00:30:00.000Z',
       json_object(
         'kind', 'starter-site-published',
         'workOrderId', w.id,
         'intakeId', w.intake_id,
         'projectId', w.project_id,
         'billingOrderId', w.billing_order_id,
         'commercialOfferId', w.commercial_offer_id,
         'maintenanceSubscriptionId', s.id,
         'monthlyAmountCents', s.amount_cents,
         'siteName', COALESCE(p.name, 'Tu sitio Starter'),
         'plan', json_extract(w.work_snapshot, '$.plan'),
         'publicUrl', w.published_url,
         'publishedAt', w.published_at
       ),
       '2026-08-03T00:30:00.000Z', '2026-08-03T00:30:00.000Z'
FROM lmw_starter_work_orders w
JOIN lmw_users u ON u.id = w.user_id
LEFT JOIN lmwares_projects p ON p.id = w.project_id
JOIN lmw_maintenance_subscriptions s ON s.work_order_id = w.id
WHERE w.id = 'work-good' AND w.status = 'live';
'@
  $null = Invoke-D1Json $notificationSql
  $null = Invoke-D1Json ($notificationSql.Replace("'notification-fixture'", "'notification-duplicate'"))
  $notification = Invoke-D1Json @'
SELECT COUNT(*) AS total, MAX(template) AS template, MAX(to_address) AS to_address,
       MAX(json_extract(payload, '$.publicUrl')) AS public_url,
       MAX(json_extract(payload, '$.maintenanceSubscriptionId')) AS subscription_id
FROM lmw_notifications
WHERE dedupe_key = 'starter-site-published:work-good';
'@
  Assert-Equal ([int]$notification[0].total) 1 'La publicación repetida debe conservar un solo comprobante.'
  Assert-Equal $notification[0].template 'starter-site-published' 'El comprobante debe usar la plantilla Starter.'
  Assert-Equal $notification[0].to_address 'maintenance-validator@example.com' 'El comprobante debe pertenecer a la cuenta contratante.'
  Assert-Equal $notification[0].public_url 'https://fixture.lmwares.com' 'El comprobante debe congelar la URL publicada.'
  Assert-Equal $notification[0].subscription_id 'maintenance-good' 'El comprobante debe enlazar la mensualidad autorizada.'

  $fk = Invoke-D1Json 'SELECT COUNT(*) AS violations FROM pragma_foreign_key_check;'
  Assert-Equal ([int]$fk[0].violations) 0 'La prueba dejó violaciones de llaves foráneas.'

  Write-Host ''
  Write-Host 'Política de mensualidad Starter validada.' -ForegroundColor Green
  Write-Host 'Verificado: elegibilidad, proyecto enlazado, pago canónico, revisión, oferta aceptada, idempotencia, publicación, cargo recurrente, cancelación terminal y comprobante recuperable.'
  Write-Host 'Proveedor: no se realizaron llamadas a Mercado Pago.'
} finally {
  $resolvedPersist = [IO.Path]::GetFullPath($persistPath)
  if ($resolvedPersist.StartsWith($resolvedParent.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedPersist)) {
    Remove-Item -LiteralPath $resolvedPersist -Recurse -Force
  }
}
