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
  param([string]$Method, [string]$Uri, [hashtable]$Headers, $Body = $null)
  $parameters = @{ Method = $Method; Uri = $Uri; Headers = $Headers; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json'
    $parameters.Body = $Body | ConvertTo-Json -Depth 12
  }
  Invoke-WebRequest @parameters
}

function Assert-Status($Response, [int]$Expected, [string]$Step) {
  if ([int]$Response.StatusCode -ne $Expected) {
    throw "$Step failed. Expected HTTP $Expected, received $($Response.StatusCode). Body: $($Response.Content)"
  }
}

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Read-Json($Response) { $Response.Content | ConvertFrom-Json }

$adminHeaders = @{ Origin = $AdminOrigin; 'X-Dev-Email' = $DevEmail }
if (-not [string]::IsNullOrWhiteSpace($env:LMWARES_ACCESS_COOKIE)) {
  $adminHeaders.Cookie = "CF_Authorization=$($env:LMWARES_ACCESS_COOKIE)"
}
$publicHeaders = @{ Origin = $PublicOrigin }
$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmssfff')
$adminBase = "$AdminApiUrl/admin/projects/$ProjectId/modules/forms"
$publicBase = "$PublicApiUrl/sites/$ProjectId/forms"

$initializeResponse = Invoke-ApiRequest POST "$adminBase/initialize" $adminHeaders @{}
Assert-Status $initializeResponse 200 'Initialize form'

$baselineDefinition = @{
  schemaVersion = 1
  title = 'Formulario público original'
  description = 'Primera revisión pública.'
  submitLabel = 'Enviar solicitud'
  successMessage = 'Solicitud original recibida.'
  fields = @(
    @{
      id = 'email_original'
      type = 'email'
      label = 'Correo original'
      required = $true
      placeholder = 'cliente@example.com'
      maxLength = 254
    }
  )
}

$draftResponse = Invoke-ApiRequest PATCH "$adminBase/definition" $adminHeaders $baselineDefinition
Assert-Status $draftResponse 200 'Save baseline definition'
$publishResponse = Invoke-ApiRequest POST "$adminBase/publish" $adminHeaders @{}
Assert-Status $publishResponse 200 'Publish baseline form'
$baselinePublished = Read-Json $publishResponse
$baselineRevision = $baselinePublished.publishedRevision

$publicResponse = Invoke-ApiRequest GET $publicBase $publicHeaders
Assert-Status $publicResponse 200 'Read baseline form'
$publicBaseline = Read-Json $publicResponse
Assert-True ($publicBaseline.definition.title -eq 'Formulario público original') 'The baseline form title is wrong.'
Assert-True ($publicBaseline.revision -eq $baselineRevision) 'The baseline revision is inconsistent.'

$revisedDefinition = @{
  schemaVersion = 1
  title = 'Formulario revisado todavía privado'
  description = 'La segunda revisión no debe filtrarse.'
  submitLabel = 'Enviar revisión'
  successMessage = 'Solicitud revisada recibida.'
  fields = @(
    @{
      id = 'nombre_nuevo'
      type = 'text'
      label = 'Nombre nuevo'
      required = $true
      minLength = 2
      maxLength = 100
    }
  )
}

Write-Host 'Saving the next form revision without publishing it...'
$revisedDraftResponse = Invoke-ApiRequest PATCH "$adminBase/definition" $adminHeaders $revisedDefinition
Assert-Status $revisedDraftResponse 200 'Save revised definition'
$revisedDraft = Read-Json $revisedDraftResponse
Assert-True ($revisedDraft.draftRevision -gt $baselineRevision) 'The draft revision did not advance.'
Assert-True ($revisedDraft.publishedRevision -eq $baselineRevision) 'Saving a draft changed the published revision.'

$unchangedResponse = Invoke-ApiRequest GET $publicBase $publicHeaders
Assert-Status $unchangedResponse 200 'Read unchanged public form'
$unchanged = Read-Json $unchangedResponse
Assert-True ($unchanged.definition.title -eq 'Formulario público original') 'Draft definition leaked into public Forms.'
Assert-True ($unchanged.definition.fields[0].id -eq 'email_original') 'Draft fields leaked into public Forms.'

$oldSubmissionResponse = Invoke-ApiRequest POST "$publicBase/requests" $publicHeaders @{
  answers = @{ email_original = "forms-$runId@example.com" }
  website = ''
}
Assert-Status $oldSubmissionResponse 201 'Submit against retained public revision'
$oldSubmission = Read-Json $oldSubmissionResponse

$futureSubmissionResponse = Invoke-ApiRequest POST "$publicBase/requests" $publicHeaders @{
  answers = @{ nombre_nuevo = 'Cliente futuro' }
  website = ''
}
Assert-Status $futureSubmissionResponse 422 'Reject unpublished draft field'

Write-Host 'Publishing the revised definition and validating its request snapshot...'
$republishResponse = Invoke-ApiRequest POST "$adminBase/publish" $adminHeaders @{}
Assert-Status $republishResponse 200 'Publish revised form'
$republished = Read-Json $republishResponse
Assert-True ($republished.publishedRevision -eq $republished.draftRevision) 'The published revision did not catch up.'

$revisedPublicResponse = Invoke-ApiRequest GET $publicBase $publicHeaders
Assert-Status $revisedPublicResponse 200 'Read revised public form'
$revisedPublic = Read-Json $revisedPublicResponse
Assert-True ($revisedPublic.definition.title -eq 'Formulario revisado todavía privado') 'The revised form was not published.'
Assert-True ($revisedPublic.definition.fields[0].id -eq 'nombre_nuevo') 'The revised field was not published.'

$newSubmissionResponse = Invoke-ApiRequest POST "$publicBase/requests" $publicHeaders @{
  answers = @{ nombre_nuevo = 'Cliente nuevo' }
  website = ''
}
Assert-Status $newSubmissionResponse 201 'Submit against revised public form'
$newSubmission = Read-Json $newSubmissionResponse

$oldDetailResponse = Invoke-ApiRequest GET "$adminBase/requests/$($oldSubmission.submissionId)" $adminHeaders
Assert-Status $oldDetailResponse 200 'Read original request snapshot'
$oldDetail = Read-Json $oldDetailResponse
Assert-True ($oldDetail.request.formRevision -eq $baselineRevision) 'The original request lost its form revision.'
Assert-True ($oldDetail.request.definitionSnapshot.title -eq 'Formulario público original') 'The original request definition snapshot changed.'

$newDetailResponse = Invoke-ApiRequest GET "$adminBase/requests/$($newSubmission.submissionId)" $adminHeaders
Assert-Status $newDetailResponse 200 'Read revised request snapshot'
$newDetail = Read-Json $newDetailResponse
Assert-True ($newDetail.request.formRevision -eq $republished.publishedRevision) 'The revised request has the wrong form revision.'

$statusResponse = Invoke-ApiRequest PATCH "$adminBase/requests/$($newSubmission.submissionId)/status" $adminHeaders @{
  status = 'in-progress'
  reason = 'Validación E2E.'
}
Assert-Status $statusResponse 200 'Update request status'
$noteResponse = Invoke-ApiRequest POST "$adminBase/requests/$($newSubmission.submissionId)/notes" $adminHeaders @{
  body = 'Nota interna de validación.'
}
Assert-Status $noteResponse 201 'Add internal note'

Write-Host ''
Write-Host 'Starter Forms draft isolation passed.' -ForegroundColor Green
Write-Host "Baseline request: $($oldSubmission.submissionId)"
Write-Host "Revised request : $($newSubmission.submissionId)"
Write-Host 'Verified        : immutable definition, answer validation, request snapshots, status and internal note'
