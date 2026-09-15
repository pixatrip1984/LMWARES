[CmdletBinding()]
param(
  [int]$Port = 8897
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$wrangler = Join-Path $repoRoot 'node_modules\.bin\wrangler.cmd'
$d1Config = Join-Path $repoRoot 'infra\d1\wrangler.toml'
$apiConfig = Join-Path $repoRoot 'workers\public-api\wrangler.toml'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lmwares-security-2a-" + [guid]::NewGuid().ToString('N'))
$sqlPath = Join-Path $testRoot 'fixtures.sql'
$logPath = Join-Path $testRoot 'public-api.log'
$errorLogPath = Join-Path $testRoot 'public-api.error.log'
$process = $null

function Invoke-Checked {
  param([string]$File, [string[]]$Arguments)
  $output = & $File @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $File $($Arguments -join ' ')`n$($output -join [Environment]::NewLine)"
  }
}

function Assert-Status {
  param([string]$Name, [int]$Expected, [scriptblock]$Request)
  $response = & $Request
  if ([int]$response.StatusCode -ne $Expected) {
    throw "$Name expected HTTP $Expected but received $($response.StatusCode)."
  }
  return $response
}

function Invoke-LocalRequest {
  param(
    [string]$Path,
    [string]$Method = 'GET',
    [hashtable]$Headers = @{},
    [string]$Body = $null
  )
  $request = @{ Uri = "http://127.0.0.1:$Port$Path"; Method = $Method; Headers = $Headers; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) { $request.Body = $Body }
  Invoke-WebRequest @request
}

New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

try {
  @'
INSERT INTO lmw_users (id, email, name, created_at, updated_at) VALUES
  ('client-a', 'client-a@example.test', 'Client A', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('client-b', 'client-b@example.test', 'Client B', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z');
INSERT INTO lmw_sessions (id, user_id, token_hash, expires_at, revoked_at, last_seen_at, created_at) VALUES
  ('session-a', 'client-a', 'fa57a52dbf08190218529730a3e99db6946c6c29220fb6e0551e21598b0b05db', '2099-01-01T00:00:00.000Z', NULL, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('session-b', 'client-b', 'e8de016fbd70182f6d2325e81df82550f3f46aaed8e784533131489144d4856d', '2099-01-01T00:00:00.000Z', NULL, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('session-revoked', 'client-a', 'be7921f7f8714dc4f4f7a00c79356a35e615273031c83f61a6396a2b38a2a2a1', '2099-01-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('session-expired', 'client-a', 'ca92d20ae7ef20f3c15399b2a2de9b50e2f2e6b727b9a7bc199233c4d86810cc', '2000-01-01T00:00:00.000Z', NULL, '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z');
INSERT INTO lmw_free_intakes (id, slug, site_name, status, contact_name, contact_email, business_description, audience, style, primary_action, user_id, metadata, created_at, updated_at) VALUES
  ('intake-a', 'synthetic-a', 'Synthetic A', 'draft', 'Client A', 'client-a@example.test', 'Synthetic fixture A', 'test', 'minimal', 'contactar', 'client-a', '{}', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
  ('intake-b', 'synthetic-b', 'Synthetic B', 'draft', 'Client B', 'client-b@example.test', 'Synthetic fixture B', 'test', 'minimal', 'contactar', 'client-b', '{}', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z');
'@ | Set-Content -LiteralPath $sqlPath -NoNewline

  Invoke-Checked $wrangler @('d1', 'migrations', 'apply', 'starter-db', '--local', '--persist-to', $testRoot, '--config', $d1Config)
  Invoke-Checked $wrangler @('d1', 'execute', 'starter-db', '--local', '--persist-to', $testRoot, '--config', $d1Config, '--file', $sqlPath)

  $process = Start-Process -FilePath $wrangler -ArgumentList @('dev', '--local', '--port', $Port, '--persist-to', $testRoot, '--config', $apiConfig) -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath -PassThru
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      $health = Invoke-LocalRequest '/health'
      if ($health.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) { throw "Local Public API did not become ready. Log: $logPath" }

  Assert-Status 'anonymous account' 401 { Invoke-LocalRequest '/account' } | Out-Null
  Assert-Status 'invalid session' 200 { Invoke-LocalRequest '/auth/session' -Headers @{ Cookie = 'lmw_session=invalid' } } | Out-Null
  Assert-Status 'revoked session' 200 { Invoke-LocalRequest '/auth/session' -Headers @{ Cookie = 'lmw_session=session-revoked' } } | Out-Null
  Assert-Status 'expired session' 200 { Invoke-LocalRequest '/auth/session' -Headers @{ Cookie = 'lmw_session=session-expired' } } | Out-Null

  $aAccount = Assert-Status 'client A account' 200 { Invoke-LocalRequest '/account' -Headers @{ Cookie = 'lmw_session=session-a' } }
  $bAccount = Assert-Status 'client B account' 200 { Invoke-LocalRequest '/account' -Headers @{ Cookie = 'lmw_session=session-b' } }
  if ($aAccount.Content -match 'synthetic-b' -or $bAccount.Content -match 'synthetic-a') {
    throw 'Account response exposed a synthetic resource from another client.'
  }

  Assert-Status 'client A reads client B Free intake' 404 { Invoke-LocalRequest '/free/intake-b/status' -Headers @{ Cookie = 'lmw_session=session-a' } } | Out-Null
  Assert-Status 'client A submits client B Free intake' 404 { Invoke-LocalRequest '/free/intake-b/submit' -Method POST -Headers @{ Cookie = 'lmw_session=session-a'; Origin = 'http://localhost:5273'; 'Content-Type' = 'application/json' } -Body '{}' } | Out-Null
  Assert-Status 'cross-origin notification mutation' 403 { Invoke-LocalRequest '/account/notifications/read-all' -Method PATCH -Headers @{ Cookie = 'lmw_session=session-a' } } | Out-Null
  Assert-Status 'runner endpoint without token' 403 { Invoke-LocalRequest '/internal/free-jobs/claim' -Method POST } | Out-Null
  Assert-Status 'forged Mercado Pago webhook' 401 { Invoke-LocalRequest '/payments/webhooks/mercado-pago?type=payment&data.id=123' -Method POST -Headers @{ 'x-request-id' = 'synthetic-request'; 'x-signature' = 'ts=1,v1=0000000000000000000000000000000000000000000000000000000000000000' } } | Out-Null

  Write-Output 'PASS: Local 2A runtime checks verified anonymous denial, session invalidation, client isolation, Origin protection, runner-token enforcement, and forged-webhook rejection.'
  & (Join-Path $PSScriptRoot 'verify-security-2a-payments.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Payment security regression suite failed.' }
}
finally {
  if ($process) {
    & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F | Out-Null
    Start-Sleep -Seconds 2
  }
  for ($attempt = 0; $attempt -lt 10 -and (Test-Path -LiteralPath $testRoot); $attempt++) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $testRoot) { Start-Sleep -Milliseconds 500 }
  }
  if (Test-Path -LiteralPath $testRoot) { throw "Could not remove isolated test state: $testRoot" }
}
