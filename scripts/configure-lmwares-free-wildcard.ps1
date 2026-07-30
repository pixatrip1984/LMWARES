[CmdletBinding()]
param(
  [string]$ZoneName = "lmwares.com",
  [string]$WorkerName = "starter-public-api",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-CloudflareToken {
  $token = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "Process")
  if (-not $token) {
    $token = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "User")
  }
  if (-not $token) {
    throw "CLOUDFLARE_API_TOKEN is not available in the process or user environment."
  }
  return $token
}

function Invoke-CloudflareApi {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET", "POST")][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [object]$Body
  )

  $parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $script:Headers
  }
  if ($null -ne $Body) {
    $parameters.ContentType = "application/json"
    $parameters.Body = $Body | ConvertTo-Json -Depth 8 -Compress
  }

  try {
    $response = Invoke-RestMethod @parameters
  } catch {
    $status = $null
    if ($null -ne $_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -eq 403 -and $Uri -match "/workers/routes") {
      throw "Cloudflare rejected Workers Routes access (HTTP 403). Update the API token with Workers Routes Read and Workers Routes Write for $ZoneName."
    }
    throw
  }

  if (-not $response.success) {
    $messages = @($response.errors | ForEach-Object { "$($_.code): $($_.message)" })
    throw "Cloudflare API rejected $Method $Uri. $($messages -join '; ')"
  }
  return $response
}

function Write-Result {
  param(
    [ValidateSet("ok", "plan", "skip")][string]$Kind,
    [string]$Message
  )

  $color = switch ($Kind) {
    "ok" { "Green" }
    "plan" { "Cyan" }
    default { "DarkGray" }
  }
  Write-Host "[$Kind] $Message" -ForegroundColor $color
}

$token = Get-CloudflareToken
$script:Headers = @{
  Authorization = "Bearer $token"
}

$apiBase = "https://api.cloudflare.com/client/v4"
$escapedZone = [Regex]::Escape($ZoneName)

Write-Host "LMWares Free wildcard configurator"
Write-Host "Mode: $(if ($Apply) { 'APPLY' } else { 'AUDIT' })"
Write-Host "Zone: $ZoneName"
Write-Host "Worker: $WorkerName"
Write-Host ""

$zoneResponse = Invoke-CloudflareApi -Method GET -Uri "$apiBase/zones?name=$ZoneName&status=active" -Body $null
$zones = @($zoneResponse.result)
if ($zones.Count -ne 1) {
  throw "Expected one active Cloudflare zone named $ZoneName; found $($zones.Count)."
}
$zoneId = [string]$zones[0].id
Write-Result "ok" "Resolved active zone $ZoneName."

$dnsResponse = Invoke-CloudflareApi -Method GET -Uri "$apiBase/zones/$zoneId/dns_records?per_page=500" -Body $null
$dnsRecords = @($dnsResponse.result)

$routeResponse = Invoke-CloudflareApi -Method GET -Uri "$apiBase/zones/$zoneId/workers/routes" -Body $null
$routes = @($routeResponse.result)

$wildcardPattern = "*.$ZoneName/*"
$wildcardRoutes = @($routes | Where-Object { $_.pattern -eq $wildcardPattern })
if ($wildcardRoutes.Count -gt 1) {
  throw "More than one Worker route uses $wildcardPattern. Resolve the duplicate routes before continuing."
}
if (
  $wildcardRoutes.Count -eq 1 -and
  [string]$wildcardRoutes[0].script -ne $WorkerName
) {
  throw "Route $wildcardPattern already belongs to a different Worker: $($wildcardRoutes[0].script)."
}

# Every existing proxied single-label hostname must win over the broad wildcard.
# An existing exact Worker route already wins by specificity. Otherwise a
# scriptless route is created so the request falls through to its current origin
# (Pages, another Custom Domain, or an external origin).
$protectedHosts = @(
  $dnsRecords |
    Where-Object {
      $_.proxied -eq $true -and
      $_.type -in @("A", "AAAA", "CNAME") -and
      $_.name -match "^[^.]+\.$escapedZone$" -and
      $_.name -ne "*.$ZoneName"
    } |
    ForEach-Object { [string]$_.name } |
    Sort-Object -Unique
)

if ($protectedHosts.Count -eq 0) {
  Write-Result "skip" "No existing proxied subdomains require exclusions."
}

$missingExclusions = @()
foreach ($hostname in $protectedHosts) {
  $exactPattern = "$hostname/*"
  $exactRoutes = @($routes | Where-Object { $_.pattern -eq $exactPattern })
  if ($exactRoutes.Count -gt 1) {
    throw "More than one Worker route uses $exactPattern. Resolve the duplicate routes before continuing."
  }
  if ($exactRoutes.Count -eq 1) {
    $target = if ([string]::IsNullOrWhiteSpace([string]$exactRoutes[0].script)) {
      "current origin"
    } else {
      "Worker $($exactRoutes[0].script)"
    }
    Write-Result "ok" "$hostname is protected by the more-specific route $exactPattern -> $target."
  } else {
    $missingExclusions += $exactPattern
    Write-Result "plan" "Create scriptless exclusion $exactPattern."
  }
}

$wildcardDns = @(
  $dnsRecords |
    Where-Object {
      $_.name -eq "*.$ZoneName" -and
      $_.type -in @("A", "AAAA", "CNAME")
    }
)
$proxiedWildcardDns = @($wildcardDns | Where-Object { $_.proxied -eq $true })
if ($wildcardDns.Count -gt 0 -and $proxiedWildcardDns.Count -eq 0) {
  throw "A DNS wildcard exists for *.$ZoneName but is not proxied. Review it manually before continuing."
}

$needsWildcardDns = $proxiedWildcardDns.Count -eq 0
if ($needsWildcardDns) {
  Write-Result "plan" "Create proxied AAAA record *.$ZoneName -> 100::."
} else {
  Write-Result "ok" "A proxied wildcard DNS record already exists for *.$ZoneName."
}

$needsWildcardRoute = $wildcardRoutes.Count -eq 0
if ($needsWildcardRoute) {
  Write-Result "plan" "Create route $wildcardPattern -> $WorkerName."
} else {
  Write-Result "ok" "Route $wildcardPattern already targets $WorkerName."
}

if (-not $Apply) {
  Write-Host ""
  Write-Host "Audit complete. Re-run with -Apply after reviewing the plan." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host "Applying safe wildcard sequence..." -ForegroundColor Cyan

# 1. Protect exact existing hosts before broad traffic can reach the Free Worker.
foreach ($pattern in $missingExclusions) {
  $null = Invoke-CloudflareApi -Method POST -Uri "$apiBase/zones/$zoneId/workers/routes" -Body @{
    pattern = $pattern
  }
  Write-Result "ok" "Created scriptless exclusion $pattern."
}

# 2. Make unknown subdomains resolve at Cloudflare's edge.
if ($needsWildcardDns) {
  $null = Invoke-CloudflareApi -Method POST -Uri "$apiBase/zones/$zoneId/dns_records" -Body @{
    type = "AAAA"
    name = "*"
    content = "100::"
    ttl = 1
    proxied = $true
    comment = "LMWares Free sites wildcard; originless placeholder routed to starter-public-api"
  }
  Write-Result "ok" "Created proxied wildcard DNS record *.$ZoneName."
}

# 3. Activate the broad route only after every existing host is protected.
if ($needsWildcardRoute) {
  $null = Invoke-CloudflareApi -Method POST -Uri "$apiBase/zones/$zoneId/workers/routes" -Body @{
    pattern = $wildcardPattern
    script = $WorkerName
  }
  Write-Result "ok" "Created route $wildcardPattern -> $WorkerName."
}

Write-Host ""
Write-Host "Wildcard configuration applied. Run this command again without -Apply to verify idempotency." -ForegroundColor Green
