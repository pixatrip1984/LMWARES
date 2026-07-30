[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-zA-Z0-9_-]{1,160}$')]
  [string]$ExternalReference,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[^@\s]+@testuser\.com$')]
  [string]$PayerEmail,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')]
  [string]$ProposalId,
  [switch]$UseStage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertFrom-SecureInput {
  param([Security.SecureString]$Value)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Read-JsonSafely {
  param([string]$Content)
  if ([string]::IsNullOrWhiteSpace($Content)) { return $null }
  try { return $Content | ConvertFrom-Json -Depth 20 }
  catch { return $null }
}

function Get-JsonProperty {
  param($InputObject, [string]$Name)
  if ($null -eq $InputObject) { return $null }
  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return $property.Value
}

$secureToken = Read-Host 'Pega el Access Token de prueba de LMWares Suscripciones (entrada oculta)' -AsSecureString
$accessToken = ConvertFrom-SecureInput $secureToken
if ([string]::IsNullOrWhiteSpace($accessToken)) {
  throw 'El Access Token no puede estar vacío.'
}

$tokenKind = if ($accessToken.StartsWith('TEST-')) { 'TEST' } elseif ($accessToken.StartsWith('APP_USR-')) { 'APP_USR' } else { 'UNKNOWN' }
Write-Output "TOKEN_KIND=$tokenKind"

$headers = @{
  Accept = 'application/json'
  Authorization = "Bearer $accessToken"
}
if ($UseStage) {
  $headers['X-scope'] = 'stage'
}
Write-Output "REQUEST_SCOPE=$(if ($UseStage) { 'stage' } else { 'default' })"

try {
  $query = [Uri]::EscapeDataString($ExternalReference)
  $searchResponse = Invoke-WebRequest `
    -Uri "https://api.mercadopago.com/preapproval/search?q=$query&limit=20" `
    -Headers $headers `
    -SkipHttpErrorCheck
  Write-Output "SEARCH_STATUS=$([int]$searchResponse.StatusCode)"
  $searchPayload = Read-JsonSafely $searchResponse.Content
  $matches = @()
  $searchResults = Get-JsonProperty $searchPayload 'results'
  if ($null -ne $searchResults) {
    $matches = @($searchResults | Where-Object { [string]$_.external_reference -eq $ExternalReference })
  }
  Write-Output "SEARCH_MATCHES=$($matches.Count)"
  if ($matches.Count -gt 0) {
    Write-Output "EXISTING_STATUS=$([string]$matches[0].status)"
    exit 0
  }
  if ([int]$searchResponse.StatusCode -lt 200 -or [int]$searchResponse.StatusCode -ge 300) {
    $providerMessage = Get-JsonProperty $searchPayload 'message'
    $message = if ($null -ne $providerMessage) { [string]$providerMessage } else { 'Sin mensaje JSON' }
    Write-Output "SEARCH_ERROR=$message"
    exit 2
  }

  $body = @{
    reason = 'Prueba técnica LMWares Starter mensual'
    external_reference = $ExternalReference
    payer_email = $PayerEmail
    auto_recurring = @{
      frequency = 1
      frequency_type = 'months'
      transaction_amount = 10
      currency_id = 'MXN'
    }
    back_url = "https://contratar.lmwares.com/pago/$([Uri]::EscapeDataString($ProposalId))"
    notification_url = 'https://api.lmwares.com/payments/webhooks/mercado-pago'
    status = 'pending'
  } | ConvertTo-Json -Depth 5 -Compress

  $createHeaders = @{} + $headers
  $createHeaders['Content-Type'] = 'application/json'
  $createResponse = Invoke-WebRequest `
    -Uri 'https://api.mercadopago.com/preapproval' `
    -Method Post `
    -Headers $createHeaders `
    -Body $body `
    -SkipHttpErrorCheck
  Write-Output "CREATE_STATUS=$([int]$createResponse.StatusCode)"
  $createPayload = Read-JsonSafely $createResponse.Content
  if ([int]$createResponse.StatusCode -ge 200 -and [int]$createResponse.StatusCode -lt 300) {
    Write-Output "CREATE_RESULT=success"
    Write-Output "PREAPPROVAL_STATUS=$([string](Get-JsonProperty $createPayload 'status'))"
  }
  else {
    $providerMessage = Get-JsonProperty $createPayload 'message'
    $message = if ($null -ne $providerMessage) { [string]$providerMessage } else { 'Sin mensaje JSON' }
    Write-Output "CREATE_RESULT=provider_error"
    Write-Output "CREATE_ERROR=$message"
    exit 3
  }
}
finally {
  $accessToken = $null
  $secureToken.Dispose()
}
