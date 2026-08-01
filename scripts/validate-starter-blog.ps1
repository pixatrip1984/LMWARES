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

function Invoke-JsonRequest {
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
    $parameters.Body = $Body | ConvertTo-Json -Depth 12
  }
  Invoke-WebRequest @parameters
}

function Assert-Status {
  param($Response, [int]$Expected, [string]$Step)
  if ([int]$Response.StatusCode -ne $Expected) {
    throw "$Step failed. Expected HTTP $Expected, received $($Response.StatusCode). Body: $($Response.Content)"
  }
}

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Read-Json($Response) {
  $Response.Content | ConvertFrom-Json
}

$adminHeaders = @{ Origin = $AdminOrigin; 'X-Dev-Email' = $DevEmail }
if (-not [string]::IsNullOrWhiteSpace($env:LMWARES_ACCESS_COOKIE)) {
  $adminHeaders.Cookie = "CF_Authorization=$($env:LMWARES_ACCESS_COOKIE)"
}
$publicHeaders = @{ Origin = $PublicOrigin }
$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmssfff')
$originalSlug = "starter-blog-e2e-$runId"
$revisedSlug = "$originalSlug-revision"
$adminBase = "$AdminApiUrl/admin/projects/$ProjectId/modules/blog"
$publicBase = "$PublicApiUrl/sites/$ProjectId/blog"

$originalBody = @{
  format = 'blocks'
  blocks = @(@{ type = 'paragraph'; text = 'Contenido público original.' })
}
$revisedBody = @{
  format = 'blocks'
  blocks = @(@{ type = 'paragraph'; text = 'Contenido todavía privado del borrador.' })
}

Write-Host 'Creating and publishing the baseline article...'
$createResponse = Invoke-JsonRequest POST $adminBase $adminHeaders @{
  slug = $originalSlug
  title = 'Artículo público original'
  summary = 'Resumen público original.'
  coverImageId = $null
  category = 'Validación'
  body = $originalBody
  status = 'published'
}
Assert-Status $createResponse 201 'Create published article'
$created = Read-Json $createResponse
Assert-True (-not [string]::IsNullOrWhiteSpace($created.publishedRevisionAt)) 'The baseline has no publication timestamp.'
Assert-True ($created.hasUnpublishedChanges -eq $false) 'The fresh publication is unexpectedly dirty.'

$baselineResponse = Invoke-JsonRequest GET "$publicBase/$originalSlug" $publicHeaders
Assert-Status $baselineResponse 200 'Read baseline publication'
$baseline = Read-Json $baselineResponse
Assert-True ($baseline.title -eq 'Artículo público original') 'The baseline title is wrong.'
Assert-True ($baseline.bodyHtml -match 'Contenido público original') 'The baseline body is wrong.'

Write-Host 'Saving a renamed and rewritten draft over the published article...'
$draftResponse = Invoke-JsonRequest PATCH "$adminBase/$originalSlug" $adminHeaders @{
  slug = $revisedSlug
  title = 'Artículo revisado todavía en borrador'
  summary = 'Resumen todavía privado.'
  coverImageId = $null
  category = 'Borradores'
  body = $revisedBody
  status = 'draft'
}
Assert-Status $draftResponse 200 'Save isolated draft'
$draft = Read-Json $draftResponse
Assert-True ($draft.status -eq 'draft') 'The working revision must be a draft.'
Assert-True ($draft.hasUnpublishedChanges -eq $true) 'The admin must expose unpublished changes.'
Assert-True (-not [string]::IsNullOrWhiteSpace($draft.publishedRevisionAt)) 'The public revision disappeared from the admin record.'

$unchangedResponse = Invoke-JsonRequest GET "$publicBase/$originalSlug" $publicHeaders
Assert-Status $unchangedResponse 200 'Read unchanged public revision'
$unchanged = Read-Json $unchangedResponse
Assert-True ($unchanged.title -eq 'Artículo público original') 'Draft title leaked into the public article.'
Assert-True ($unchanged.bodyHtml -match 'Contenido público original') 'Draft body leaked into the public article.'

$futureSlugResponse = Invoke-JsonRequest GET "$publicBase/$revisedSlug" $publicHeaders
Assert-Status $futureSlugResponse 404 'Hide draft slug'

Write-Host 'Publishing the draft as the next immutable revision...'
$publishResponse = Invoke-JsonRequest PATCH "$adminBase/$revisedSlug" $adminHeaders @{
  slug = $revisedSlug
  title = 'Artículo revisado todavía en borrador'
  summary = 'Resumen todavía privado.'
  coverImageId = $null
  category = 'Borradores'
  body = $revisedBody
  status = 'published'
}
Assert-Status $publishResponse 200 'Publish revised article'
$published = Read-Json $publishResponse
Assert-True ($published.status -eq 'published') 'The working article was not marked published.'
Assert-True ($published.hasUnpublishedChanges -eq $false) 'The republished article is still marked dirty.'

$revisedResponse = Invoke-JsonRequest GET "$publicBase/$revisedSlug" $publicHeaders
Assert-Status $revisedResponse 200 'Read revised publication'
$revised = Read-Json $revisedResponse
Assert-True ($revised.title -eq 'Artículo revisado todavía en borrador') 'The revised title was not published.'
Assert-True ($revised.bodyHtml -match 'Contenido todavía privado') 'The revised body was not published.'

$oldSlugResponse = Invoke-JsonRequest GET "$publicBase/$originalSlug" $publicHeaders
Assert-Status $oldSlugResponse 404 'Retire old public slug'

Write-Host 'Archiving the article and withdrawing its public snapshot...'
$archiveResponse = Invoke-JsonRequest PATCH "$adminBase/$revisedSlug" $adminHeaders @{
  status = 'archived'
  statusReason = 'Fin de la prueba E2E.'
}
Assert-Status $archiveResponse 200 'Archive article'
$withdrawnResponse = Invoke-JsonRequest GET "$publicBase/$revisedSlug" $publicHeaders
Assert-Status $withdrawnResponse 404 'Withdraw archived publication'

Write-Host ''
Write-Host 'Starter Blog draft isolation passed.' -ForegroundColor Green
Write-Host "Article ID: $($created.id)"
Write-Host 'Verified  : immutable public snapshot, slug/title/body isolation, republish and archive withdrawal'
