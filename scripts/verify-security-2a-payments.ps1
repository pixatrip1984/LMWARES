[CmdletBinding()]
param([int]$Port = 8898, [string]$Block = '')

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$wrangler = Join-Path $root 'node_modules\.bin\wrangler.cmd'
$workerConfig = Join-Path $root 'workers\public-api\wrangler.security-2a.toml'
$d1Config = $workerConfig
$state = Join-Path ([IO.Path]::GetTempPath()) ('lmwares-security-2a-payments-' + [guid]::NewGuid().ToString('N'))
$sql = Join-Path $state 'fixtures.sql'
$providerSql = Join-Path $state 'provider-fixtures.sql'
$worker = $null

function Run([string[]]$args) { $out = & $wrangler @args 2>&1; if ($LASTEXITCODE -ne 0) { throw ($out -join "`n") }; return ($out -join "`n") }
function Db([string]$query) {
  $out = & $wrangler d1 execute starter-db --local --persist-to $state --config $d1Config --command $query 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($out -join "`n") }
  return ($out -join "`n")
}
function Expect([string]$name, [int]$status, [scriptblock]$request) { $r = & $request; if ([int]$r.StatusCode -ne $status) { throw "$name expected $status, got $($r.StatusCode): $($r.Content)" }; return $r }
function State([string]$id) { $out = Db "SELECT status FROM lmw_billing_orders WHERE id = '$id'"; if ($out -match '"status"\s*:\s*"([^"]+)"') { return $Matches[1] }; throw "No state for ${id}: $out" }
function Count([string]$table, [string]$where) { $out = Db "SELECT COUNT(*) AS count FROM $table WHERE $where"; if ($out -match '"count"\s*:\s*(\d+)') { return [int]$Matches[1] }; throw "No count from ${table}: $out" }
function Signature([string]$id, [string]$requestId, [string]$secret = 'security-2a-synthetic-webhook-secret') {
  $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
  $manifest = "id:$($id.ToLower());request-id:$requestId;ts:$timestamp;"
  $mac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
  $hex = ([BitConverter]::ToString($mac.ComputeHash([Text.Encoding]::UTF8.GetBytes($manifest)))).Replace('-','').ToLowerInvariant()
  return "ts=$timestamp,v1=$hex"
}
function Webhook([string]$paymentId, [string]$requestId, [bool]$valid = $true, [string]$scope = 'commercial') {
  $secret = if ($scope -eq 'maintenance') { 'security-2a-synthetic-maintenance-webhook-secret' } else { 'security-2a-synthetic-webhook-secret' }
  $sig = if ($valid) { Signature $paymentId $requestId $secret } else { 'ts=1,v1=0000000000000000000000000000000000000000000000000000000000000000' }
  $bodyPath = Join-Path $state ('response-' + [guid]::NewGuid().ToString('N') + '.json')
  $status = & curl.exe -s -o $bodyPath -w '%{http_code}' -X POST "http://127.0.0.1:$Port/payments/webhooks/mercado-pago?scope=$scope&type=payment&data.id=$paymentId" -H "x-request-id: $requestId" -H "x-signature: $sig"
  $content = if (Test-Path $bodyPath) { Get-Content -Raw $bodyPath } else { '' }
  Remove-Item $bodyPath -Force -ErrorAction SilentlyContinue
  [pscustomobject]@{ StatusCode = [int]$status; Content = $content }
}

New-Item -ItemType Directory -Path $state -Force | Out-Null
try {
@'
INSERT INTO lmw_users (id,email,name,created_at,updated_at) VALUES ('client-a','client-a@example.test','Client A','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z'),('client-b','client-b@example.test','Client B','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z');
CREATE TABLE security_2a_provider_fixtures (payment_id TEXT PRIMARY KEY, response_status INTEGER NOT NULL, response_body TEXT NOT NULL);
CREATE TABLE security_2a_provider_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, payment_id TEXT NOT NULL, authorization TEXT, method TEXT NOT NULL);
INSERT INTO lmw_billing_orders (id,purpose,user_id,status,amount_cents,currency,order_snapshot,external_reference,created_at,updated_at) VALUES
('o-p01','cart','client-a','ready',10000,'MXN','{}','lmw-implementation:o-p01','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z'),
('o-p02','cart','client-a','ready',10000,'MXN','{}','lmw-implementation:o-p02','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z'),
('o-p03','cart','client-a','ready',10000,'MXN','{}','lmw-implementation:o-p03','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z'),
('o-p06','cart','client-a','ready',10000,'MXN','{}','lmw-implementation:o-p06','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z'),
('o-p07','cart','client-a','ready',10000,'MXN','{}','lmw-implementation:o-p07','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z'),
('o-p10','cart','client-a','ready',10000,'MXN','{}','lmw-implementation:o-p10','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z'),
('o-p11','cart','client-a','ready',10000,'MXN','{}','lmw-implementation:o-p11','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z'),
('o-p12','cart','client-a','ready',10000,'MXN','{}','lmw-implementation:o-p12','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z'),
('o-a','cart','client-a','ready',10000,'MXN','{}','lmw-implementation:o-a','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z'),
('o-b','cart','client-b','ready',10000,'MXN','{}','lmw-implementation:o-b','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z');
'@ | Set-Content -LiteralPath $sql -NoNewline
  Run @('d1','migrations','apply','starter-db','--local','--persist-to',$state,'--config',$d1Config) | Out-Null
  Run @('d1','execute','starter-db','--local','--persist-to',$state,'--config',$d1Config,'--file',$sql) | Out-Null

  $providerFixturesSql = @'
INSERT INTO security_2a_provider_fixtures (payment_id,response_status,response_body) VALUES
('1001',200,'{"id":"1001","status":"approved","external_reference":"lmw-implementation:o-p01","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1002',200,'{"id":"1002","status":"approved","external_reference":"lmw-implementation:o-p02","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1003',200,'{"id":"1003","status":"approved","external_reference":"lmw-implementation:o-p03","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1005',200,'{"id":"1005","status":"approved","external_reference":"lmw-implementation:not-an-order","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1006',200,'{"id":"1006","status":"approved","external_reference":"lmw-implementation:o-p06","currency_id":"MXN","transaction_amount":99,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1007',200,'{"id":"1007","status":"approved","external_reference":"lmw-implementation:o-p07","currency_id":"USD","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1009',500,'{"message":"synthetic provider error"}'),
('1010',200,'{"id":"1010","status":"pending","external_reference":"lmw-implementation:o-p10","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1011',200,'{"id":"1011","status":"approved","external_reference":"lmw-implementation:o-p10","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1012',200,'{"id":"1012","status":"approved","external_reference":"lmw-implementation:o-p11","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1013',200,'{"id":"1013","status":"pending","external_reference":"lmw-implementation:o-p11","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1014',200,'{"id":"1014","status":"approved","external_reference":"lmw-implementation:o-p12","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}'),
('1015',200,'{"id":"1015","status":"rejected","external_reference":"lmw-implementation:o-p12","currency_id":"MXN","transaction_amount":100,"date_created":"2026-08-31T00:00:00.000Z"}');
'@
  $providerFixturesSql | Set-Content -LiteralPath $providerSql -NoNewline
  Run @('d1','execute','starter-db','--local','--persist-to',$state,'--config',$d1Config,'--file',$providerSql) | Out-Null

  $log = Join-Path $state 'worker.log'; $err = Join-Path $state 'worker.err'
  $worker = Start-Process -FilePath $wrangler -ArgumentList @('dev','--local','--port',$Port,'--persist-to',$state,'--config',$workerConfig) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
  for ($i=0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 400; if ((& curl.exe -s -o NUL -w '%{http_code}' "http://127.0.0.1:$Port/payments/webhooks/mercado-pago") -ne '000') { break } }

  if ($Block) {
    switch ($Block) {
      'P01' { Expect 'P01 valid payment' 200 { Webhook '1001' 'p01' } | Out-Null; if ((State 'o-p01') -ne 'paid') { throw 'P01 did not pay exactly one valid order.' } }
      'P04' { Expect 'P04 invalid signature' 401 { Webhook '1001' 'p04' $false } | Out-Null; if ((Count 'security_2a_provider_requests' "payment_id='1001'") -ne 0) { throw 'P04 contacted provider.' } }
      'P05' { Expect 'P05 unknown reference' 200 { Webhook '1005' 'p05' } | Out-Null; if ((State 'o-a') -ne 'ready' -or (State 'o-b') -ne 'ready') { throw 'P05 modified an unrelated order.' } }
      'P06' { Expect 'P06 amount mismatch' 500 { Webhook '1006' 'p06' } | Out-Null; if ((State 'o-p06') -ne 'ready') { throw 'P06 accepted a mismatched amount.' } }
      'P07' { Expect 'P07 currency mismatch' 500 { Webhook '1007' 'p07' } | Out-Null; if ((State 'o-p07') -ne 'ready') { throw 'P07 accepted a mismatched currency.' } }
      default { throw "Unknown block: $Block" }
    }
    Write-Output "PASS: $Block"
    return
  }

  Expect 'P01 valid payment' 200 { Webhook '1001' 'p01' } | Out-Null; if ((State 'o-p01') -ne 'paid') { throw 'P01 did not pay exactly one valid order.' }
  Expect 'P02 first' 200 { Webhook '1002' 'p02' } | Out-Null; Expect 'P02 duplicate' 200 { Webhook '1002' 'p02' } | Out-Null; if ((Count 'lmw_billing_payment_attempts' "billing_order_id='o-p02'") -ne 1) { throw 'P02 duplicated economic effect.' }
  for ($i=0; $i -lt 5; $i++) { Expect 'P03 repeat' 200 { Webhook '1003' 'p03' } | Out-Null }; if ((Count 'lmw_billing_payment_attempts' "billing_order_id='o-p03'") -ne 1) { throw 'P03 accumulated effects.' }
  Expect 'P04 invalid signature' 401 { Webhook '1001' 'p04' $false } | Out-Null; if ((Count 'security_2a_provider_requests' "payment_id='1001'") -ne 1) { throw 'P04 contacted provider.' }
  Expect 'P05 unknown reference' 200 { Webhook '1005' 'p05' } | Out-Null; if ((State 'o-a') -ne 'ready' -or (State 'o-b') -ne 'ready') { throw 'P05 modified an unrelated order.' }
  Expect 'P06 amount mismatch' 500 { Webhook '1006' 'p06' } | Out-Null; if ((State 'o-p06') -ne 'ready') { throw 'P06 accepted a mismatched amount.' }
  Expect 'P07 currency mismatch' 500 { Webhook '1007' 'p07' } | Out-Null; if ((State 'o-p07') -ne 'ready') { throw 'P07 accepted a mismatched currency.' }
  Expect 'P08 not found' 500 { Webhook '1008' 'p08' } | Out-Null
  Expect 'P09 provider error' 500 { Webhook '1009' 'p09' } | Out-Null; if ((State 'o-a') -ne 'ready') { throw 'P09 created a false economic state.' }
  Expect 'P10 pending' 200 { Webhook '1010' 'p10a' } | Out-Null; if ((State 'o-p10') -ne 'payment_pending') { throw 'P10 did not retain pending state.' }; Expect 'P10 approved' 200 { Webhook '1011' 'p10b' } | Out-Null; if ((State 'o-p10') -ne 'paid') { throw 'P10 did not advance pending to paid.' }
  Expect 'P11 approved' 200 { Webhook '1012' 'p11a' } | Out-Null; Expect 'P11 late pending' 200 { Webhook '1013' 'p11b' } | Out-Null; if ((State 'o-p11') -ne 'paid') { throw 'P11 regressed paid to pending.' }
  Expect 'P12 approved' 200 { Webhook '1014' 'p12a' } | Out-Null; Expect 'P12 rejected' 200 { Webhook '1015' 'p12b' } | Out-Null; if ((State 'o-p12') -ne 'paid') { throw 'P12 changed final paid state contrary to the current state machine.' }
  Expect 'P14 commercial in maintenance channel' 401 { Webhook '1001' 'p14' $true 'maintenance' } | Out-Null
  Expect 'P15 maintenance channel cannot settle commercial order' 401 { Webhook '1001' 'p15' $true 'maintenance' } | Out-Null

  Write-Output 'PASS: P01-P12 and P14 executed against the real payments route, D1 temporary state, synthetic valid HMAC, and an injected local Mercado Pago transport.'
}
finally {
  if ($worker) { & "$env:SystemRoot\System32\taskkill.exe" /PID $worker.Id /T /F | Out-Null; Start-Sleep -Seconds 1 }
  Remove-Item -LiteralPath $state -Recurse -Force -ErrorAction SilentlyContinue
}
