[CmdletBinding()]
param(
  [string]$PublicApiUrl = 'http://127.0.0.1:8887',
  [string]$AdminApiUrl = 'http://127.0.0.1:8888',
  [string]$PublicOrigin = 'http://127.0.0.1:5273',
  [string]$AdminOrigin = 'http://127.0.0.1:5274',
  [string]$DevEmail = 'admin@example.com'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Net.Http

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Json([string]$Method, [string]$Uri, [hashtable]$Headers, $Body = $null) {
  $parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    ErrorAction = 'Stop'
  }

  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json'
    $parameters.Body = ($Body | ConvertTo-Json -Depth 10)
  }

  Invoke-RestMethod @parameters
}

function Test-Cors([string]$Url, [string]$Origin, [string]$Method, [string]$Headers = 'content-type') {
  $client = [System.Net.Http.HttpClient]::new()
  $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Options, $Url)
  $null = $request.Headers.TryAddWithoutValidation('Origin', $Origin)
  $null = $request.Headers.TryAddWithoutValidation('Access-Control-Request-Method', $Method)
  $null = $request.Headers.TryAddWithoutValidation('Access-Control-Request-Headers', $Headers)
  $response = $null

  try {
    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    $statusCode = [int]$response.StatusCode
    $allowedOrigin = ''
    if ($response.Headers.Contains('Access-Control-Allow-Origin')) {
      $allowedOrigin = ($response.Headers.GetValues('Access-Control-Allow-Origin') -join ',')
    }

    if ($statusCode -ne 204 -or $allowedOrigin -ne $Origin) {
      throw "CORS failed for $Url from $Origin. Status=$statusCode, Allow-Origin=$allowedOrigin"
    }
  } finally {
    if ($null -ne $response) { $response.Dispose() }
    $request.Dispose()
    $client.Dispose()
  }
}

Write-Step "Health checks"
$publicHealth = Invoke-RestMethod "$PublicApiUrl/health"
$adminHealth = Invoke-RestMethod "$AdminApiUrl/health"
Write-Host "Public API: $($publicHealth.service)"
Write-Host "Admin API : $($adminHealth.service)"

Write-Step "CORS preflight"
Test-Cors "$PublicApiUrl/requests" $PublicOrigin 'POST'
Test-Cors "$AdminApiUrl/admin/requests" $AdminOrigin 'GET' 'content-type,x-dev-email'
Write-Host 'CORS OK'

Write-Step "Public API read"
$publications = Invoke-Json 'GET' "$PublicApiUrl/publications?page=1&pageSize=5" @{ Origin = $PublicOrigin }
Write-Host "Publications returned: $($publications.items.Count)"

Write-Step "Create public request"
$requestBody = @{
  type = 'contact'
  contactName = 'Validacion Local'
  contactEmail = 'validacion.local@example.com'
  contactPhone = '+52 55 0000 0000'
  message = 'Solicitud creada por scripts/local-validate.ps1'
  payload = @{ validation = $true }
  turnstileToken = 'local-validation-token'
}
$created = Invoke-Json 'POST' "$PublicApiUrl/requests" @{ Origin = $PublicOrigin } $requestBody
if (-not $created.id) {
  throw 'Public request was created without an id.'
}
Write-Host "Created request: $($created.id)"

Write-Step "Admin API write"
$adminHeaders = @{
  Origin = $AdminOrigin
  'X-Dev-Email' = $DevEmail
}
Invoke-Json 'GET' "$AdminApiUrl/admin/me" $adminHeaders | Out-Null
$updated = Invoke-Json 'PATCH' "$AdminApiUrl/admin/requests/$($created.id)/status" $adminHeaders @{
  status = 'in_review'
  reason = 'Validacion local automatizada'
}
$note = Invoke-Json 'POST' "$AdminApiUrl/admin/requests/$($created.id)/notes" $adminHeaders @{
  body = 'Nota creada por validacion local automatizada.'
}
Write-Host "Updated status: $($updated.status)"
Write-Host "Created note  : $($note.id)"

Write-Step "Local validation complete"
Write-Host 'The starter local backend, D1, CORS, public API, and admin API are working.'
