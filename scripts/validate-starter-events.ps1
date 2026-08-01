[CmdletBinding()]
param(
  [string]$PublicApiUrl = 'http://127.0.0.1:8887',
  [string]$AdminApiUrl = 'http://127.0.0.1:8888',
  [string]$PublicOrigin = 'http://127.0.0.1:5273',
  [string]$AdminOrigin = 'http://127.0.0.1:5274',
  [string]$ProjectId = 'astraeus',
  [string]$DevEmail = 'admin@example.com'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-ApiRequest {
  param(
    [Parameter(Mandatory)] [string]$Method,
    [Parameter(Mandatory)] [string]$Uri,
    [Parameter(Mandatory)] [hashtable]$Headers,
    $Body = $null
  )

  $parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    SkipHttpErrorCheck = $true
  }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json'
    $parameters.Body = $Body | ConvertTo-Json -Depth 10
  }
  Invoke-WebRequest @parameters
}

function Assert-Status {
  param(
    [Parameter(Mandatory)] $Response,
    [Parameter(Mandatory)] [int]$Expected,
    [Parameter(Mandatory)] [string]$Step
  )

  $actual = [int]$Response.StatusCode
  if ($actual -ne $Expected) {
    throw "$Step failed. Expected HTTP $Expected, received $actual. Body: $($Response.Content)"
  }
}

function Read-Json($Response) {
  $Response.Content | ConvertFrom-Json
}

$adminHeaders = @{
  Origin = $AdminOrigin
  'X-Dev-Email' = $DevEmail
}
if (-not [string]::IsNullOrWhiteSpace($env:LMWARES_ACCESS_COOKIE)) {
  $adminHeaders.Cookie = "CF_Authorization=$($env:LMWARES_ACCESS_COOKIE)"
}
$publicHeaders = @{ Origin = $PublicOrigin }
$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmssfff')
$eventSlug = "starter-events-e2e-$runId"
$revisedSlug = "$eventSlug-revision"
$firstEmail = "events-e2e-$runId-first@example.com"
$replacementEmail = "events-e2e-$runId-replacement@example.com"
$start = [DateTimeOffset]::UtcNow.AddDays(30)
$end = $start.AddHours(2)
$registrationClose = $start.AddHours(-1)

$eventPayload = @{
  slug = $eventSlug
  title = 'Validación E2E de Eventos Starter'
  summary = 'Prueba reproducible de publicación, cupo y estados.'
  description = 'Creado automáticamente por scripts/validate-starter-events.ps1.'
  venueName = 'LMWares Lab'
  venueAddress = 'Monterrey, Nuevo León'
  timezone = 'America/Mexico_City'
  startsAtUtc = $start.ToString('o')
  endsAtUtc = $end.ToString('o')
  registrationClosesAtUtc = $registrationClose.ToString('o')
  capacity = 2
  coverAssetId = $null
}

$adminBase = "$AdminApiUrl/admin/projects/$ProjectId/modules/events"

Write-Host 'Creating and publishing event...'
$createResponse = Invoke-ApiRequest POST $adminBase $adminHeaders $eventPayload
Assert-Status $createResponse 201 'Create event'
$createdEvent = Read-Json $createResponse
$eventId = $createdEvent.id
$eventAdminUrl = "$adminBase/$eventId"
$registrationUrl = "$PublicApiUrl/sites/$ProjectId/events/$eventId/registrations"

$publishResponse = Invoke-ApiRequest PATCH "$eventAdminUrl/status" $adminHeaders @{
  status = 'published'
}
Assert-Status $publishResponse 200 'Publish event'

Write-Host 'Saving an isolated revision over the public event...'
$draftPayload = $eventPayload.Clone()
$draftPayload.slug = $revisedSlug
$draftPayload.title = 'Evento revisado todavía en borrador'
$draftPayload.venueName = 'Ubicación todavía privada'
$updateDraftResponse = Invoke-ApiRequest PATCH $eventAdminUrl $adminHeaders $draftPayload
Assert-Status $updateDraftResponse 200 'Update event draft fields'
$saveDraftResponse = Invoke-ApiRequest PATCH "$eventAdminUrl/status" $adminHeaders @{
  status = 'draft'
}
Assert-Status $saveDraftResponse 200 'Save event draft'
$savedDraft = Read-Json $saveDraftResponse
if (-not $savedDraft.hasUnpublishedChanges -or [string]::IsNullOrWhiteSpace($savedDraft.publishedRevisionAt)) {
  throw 'The admin did not preserve or identify the public event revision.'
}

$publishedPreviewResponse = Invoke-ApiRequest GET "$adminBase/published" $adminHeaders
Assert-Status $publishedPreviewResponse 200 'Read exact admin public preview'
$publishedPreview = (Read-Json $publishedPreviewResponse).events |
  Where-Object id -EQ $eventId |
  Select-Object -First 1
if (-not $publishedPreview -or
    $publishedPreview.title -ne 'Validación E2E de Eventos Starter' -or
    $publishedPreview.slug -ne $eventSlug -or
    $publishedPreview.venueName -ne 'LMWares Lab') {
  throw 'The admin public preview did not preserve the exact published event snapshot.'
}

$unchangedEventResponse = Invoke-ApiRequest GET "$PublicApiUrl/sites/$ProjectId/events/$eventId" $publicHeaders
Assert-Status $unchangedEventResponse 200 'Read unchanged event publication'
$unchangedEvent = (Read-Json $unchangedEventResponse).event
if ($unchangedEvent.title -ne 'Validación E2E de Eventos Starter' -or
    $unchangedEvent.slug -ne $eventSlug -or
    $unchangedEvent.venueName -ne 'LMWares Lab') {
  throw 'Draft event fields leaked into the public snapshot.'
}

$republishResponse = Invoke-ApiRequest PATCH "$eventAdminUrl/status" $adminHeaders @{
  status = 'published'
}
Assert-Status $republishResponse 200 'Publish revised event'
$republishedEvent = Read-Json $republishResponse
if ($republishedEvent.hasUnpublishedChanges) {
  throw 'The republished event is still marked with unpublished changes.'
}
$revisedEventResponse = Invoke-ApiRequest GET "$PublicApiUrl/sites/$ProjectId/events/$eventId" $publicHeaders
Assert-Status $revisedEventResponse 200 'Read revised event publication'
$revisedEvent = (Read-Json $revisedEventResponse).event
if ($revisedEvent.title -ne 'Evento revisado todavía en borrador' -or
    $revisedEvent.slug -ne $revisedSlug -or
    $revisedEvent.venueName -ne 'Ubicación todavía privada') {
  throw 'The revised event fields were not published.'
}

Write-Host 'Checking first registration and email deduplication...'
$firstResponse = Invoke-ApiRequest POST $registrationUrl $publicHeaders @{
  fullName = 'Asistente inicial'
  email = $firstEmail
  notes = 'Primera inscripción de la validación.'
  website = ''
}
Assert-Status $firstResponse 201 'First registration'

$duplicateResponse = Invoke-ApiRequest POST $registrationUrl $publicHeaders @{
  fullName = 'Asistente duplicado'
  email = $firstEmail.ToUpperInvariant()
  website = ''
}
Assert-Status $duplicateResponse 409 'Duplicate registration'

Write-Host 'Racing two requests for the final spot...'
$concurrentResults = 1, 2 | ForEach-Object -Parallel {
  $body = @{
    fullName = "Asistente concurrente $_"
    email = "events-e2e-$using:runId-concurrent-$_@example.com"
    notes = 'Carrera por el último lugar.'
    website = ''
  } | ConvertTo-Json
  $response = Invoke-WebRequest `
    -Method POST `
    -Uri $using:registrationUrl `
    -Headers @{ Origin = $using:PublicOrigin } `
    -ContentType 'application/json' `
    -Body $body `
    -SkipHttpErrorCheck
  [pscustomobject]@{
    Attempt = $_
    Status = [int]$response.StatusCode
    Body = $response.Content
  }
} -ThrottleLimit 2

$concurrentStatuses = @($concurrentResults.Status | Sort-Object)
if ($concurrentStatuses.Count -ne 2 -or $concurrentStatuses[0] -ne 201 -or $concurrentStatuses[1] -ne 409) {
  throw "Concurrency check failed. Expected one 201 and one 409: $($concurrentResults | ConvertTo-Json -Compress)"
}
$rejectedConcurrent = $concurrentResults | Where-Object Status -EQ 409 | Select-Object -First 1
$rejectedConcurrentBody = $rejectedConcurrent.Body | ConvertFrom-Json
if ($rejectedConcurrentBody.error.message -ne 'El evento ya alcanzó su cupo.') {
  throw "Concurrency check failed for an unexpected reason: $($rejectedConcurrent.Body)"
}

$publicEventResponse = Invoke-ApiRequest GET "$PublicApiUrl/sites/$ProjectId/events/$eventId" $publicHeaders
Assert-Status $publicEventResponse 200 'Read public event'
$publicEvent = (Read-Json $publicEventResponse).event
if ($publicEvent.registrationCount -ne 2 -or $publicEvent.spotsRemaining -ne 0) {
  throw "Capacity invariant failed. Count=$($publicEvent.registrationCount), remaining=$($publicEvent.spotsRemaining)"
}

Write-Host 'Cancelling a registration and reusing its spot...'
$detailResponse = Invoke-ApiRequest GET $eventAdminUrl $adminHeaders
Assert-Status $detailResponse 200 'Read admin event'
$detail = Read-Json $detailResponse
$firstRegistration = $detail.registrations | Where-Object email -EQ $firstEmail | Select-Object -First 1
if (-not $firstRegistration) {
  throw 'The first registration was not returned by the admin endpoint.'
}

$cancelResponse = Invoke-ApiRequest PATCH "$eventAdminUrl/registrations/$($firstRegistration.id)" $adminHeaders @{
  status = 'cancelled'
}
Assert-Status $cancelResponse 200 'Cancel registration'

$replacementResponse = Invoke-ApiRequest POST $registrationUrl $publicHeaders @{
  fullName = 'Asistente de reemplazo'
  email = $replacementEmail
  notes = 'Ocupa el lugar liberado.'
  website = ''
}
Assert-Status $replacementResponse 201 'Reuse released spot'

$restoreResponse = Invoke-ApiRequest PATCH "$eventAdminUrl/registrations/$($firstRegistration.id)" $adminHeaders @{
  status = 'confirmed'
}
Assert-Status $restoreResponse 409 'Block restore above capacity'

$lowerCapacityPayload = $eventPayload.Clone()
$lowerCapacityPayload.capacity = 1
$lowerCapacityResponse = Invoke-ApiRequest PATCH $eventAdminUrl $adminHeaders $lowerCapacityPayload
Assert-Status $lowerCapacityResponse 409 'Block capacity below confirmed count'

Write-Host 'Cancelling event and checking that registration closes...'
$cancelEventResponse = Invoke-ApiRequest PATCH "$eventAdminUrl/status" $adminHeaders @{
  status = 'cancelled'
}
Assert-Status $cancelEventResponse 200 'Cancel event'

$closedRegistrationResponse = Invoke-ApiRequest POST $registrationUrl $publicHeaders @{
  fullName = 'Asistente fuera de plazo'
  email = "events-e2e-$runId-closed@example.com"
  website = ''
}
Assert-Status $closedRegistrationResponse 409 'Block registration on cancelled event'

Write-Host ''
Write-Host 'Starter Events validation passed.' -ForegroundColor Green
Write-Host "Event ID : $eventId"
Write-Host "Slug     : $revisedSlug"
Write-Host 'Verified : immutable draft revision, republish, duplicate email, concurrent final spot, cancellation, slot reuse, capacity guard, event closure'
