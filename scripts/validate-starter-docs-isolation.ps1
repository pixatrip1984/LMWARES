#requires -Version 7.0

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
  param([string]$Method, [string]$Uri, [hashtable]$Headers, $Body = $null)
  $parameters = @{ Method = $Method; Uri = $Uri; Headers = $Headers; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json'
    $parameters.Body = $Body | ConvertTo-Json -Depth 12
  }
  Invoke-WebRequest @parameters
}

function Invoke-Upload {
  param(
    [string]$Uri,
    [hashtable]$Headers,
    [string]$Path,
    [hashtable]$Fields = @{}
  )
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'curl.exe'
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($entry in $Headers.GetEnumerator()) {
    $startInfo.ArgumentList.Add('--header')
    $startInfo.ArgumentList.Add("$($entry.Key): $($entry.Value)")
  }
  $startInfo.ArgumentList.Add('--silent')
  $startInfo.ArgumentList.Add('--show-error')
  $startInfo.ArgumentList.Add('--write-out')
  $startInfo.ArgumentList.Add("`n%{http_code}")
  $startInfo.ArgumentList.Add('--form')
  $startInfo.ArgumentList.Add("file=@$Path;type=text/plain;filename=$([IO.Path]::GetFileName($Path))")
  foreach ($entry in $Fields.GetEnumerator()) {
    $startInfo.ArgumentList.Add('--form-string')
    $startInfo.ArgumentList.Add("$($entry.Key)=$($entry.Value)")
  }
  $startInfo.ArgumentList.Add($Uri)

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $process.Start() | Out-Null
  $output = $process.StandardOutput.ReadToEnd()
  $errorOutput = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "curl upload failed: $errorOutput" }
  if ($output -notmatch '(?s)^(.*)\r?\n([0-9]{3})$') { throw "Invalid curl response: $output" }
  [pscustomobject]@{ StatusCode = [int]$Matches[2]; Content = $Matches[1] }
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
$adminBase = "$AdminApiUrl/admin/projects/$ProjectId/modules/docs"
$publicBase = "$PublicApiUrl/sites/$ProjectId/docs"
$tempDirectory = Join-Path ([IO.Path]::GetTempPath()) "lmwares-docs-$runId"
$firstFile = Join-Path $tempDirectory 'original.txt'
$secondFile = Join-Path $tempDirectory 'revision.txt'

[IO.Directory]::CreateDirectory($tempDirectory) | Out-Null
[IO.File]::WriteAllText($firstFile, "PUBLIC ORIGINAL $runId", [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($secondFile, "PRIVATE DRAFT $runId", [Text.UTF8Encoding]::new($false))

try {
  Write-Host 'Creating category, uploading and publishing the baseline document...'
  $categoryResponse = Invoke-JsonRequest POST "$adminBase/categories" $adminHeaders @{
    name = 'Categoría pública original'
    slug = "docs-e2e-$runId"
    description = 'Categoría de la prueba.'
    sortOrder = 0
  }
  Assert-Status $categoryResponse 201 'Create category'
  $category = Read-Json $categoryResponse

  $createResponse = Invoke-Upload "$adminBase/documents" $adminHeaders $firstFile @{
    title = 'Documento público original'
    description = 'Descripción pública original.'
    categoryId = $category.id
    accessLevel = 'public'
    downloadEnabled = 'true'
    sortOrder = '0'
    metadata = '{"audience":"public"}'
  }
  Assert-Status $createResponse 201 'Upload baseline document'
  $created = Read-Json $createResponse
  $documentId = $created.id

  $publishResponse = Invoke-JsonRequest POST "$adminBase/documents/$documentId/publish" $adminHeaders @{}
  Assert-Status $publishResponse 200 'Publish baseline document'
  $published = Read-Json $publishResponse
  Assert-True (-not [string]::IsNullOrWhiteSpace($published.publishedRevisionAt)) 'The baseline has no public revision.'
  Assert-True ($published.hasUnpublishedChanges -eq $false) 'The fresh publication is unexpectedly dirty.'

  $libraryResponse = Invoke-JsonRequest GET $publicBase $publicHeaders
  Assert-Status $libraryResponse 200 'Read baseline library'
  $library = Read-Json $libraryResponse
  $baseline = $library.documents | Where-Object id -EQ $documentId | Select-Object -First 1
  Assert-True ($null -ne $baseline) 'The published document is absent from the library.'
  Assert-True ($baseline.title -eq 'Documento público original') 'The baseline title is wrong.'
  Assert-True ($baseline.categoryName -eq 'Categoría pública original') 'The baseline category is wrong.'
  $downloadResponse = Invoke-WebRequest -Uri "$publicBase/$documentId/download" -Headers $publicHeaders -SkipHttpErrorCheck
  Assert-Status $downloadResponse 200 'Download baseline file'
  Assert-True ($downloadResponse.Content -match "PUBLIC ORIGINAL $runId") 'The baseline bytes are wrong.'

  Write-Host 'Editing metadata/category and uploading a new private version...'
  $patchResponse = Invoke-JsonRequest PATCH "$adminBase/documents/$documentId" $adminHeaders @{
    title = 'Documento revisado todavía privado'
    description = 'Descripción privada del borrador.'
    metadata = @{ audience = 'draft' }
    sortOrder = 9
  }
  Assert-Status $patchResponse 200 'Edit document draft'

  $categoryPatch = Invoke-JsonRequest PATCH "$adminBase/categories/$($category.id)" $adminHeaders @{
    name = 'Categoría todavía privada'
    slug = "docs-e2e-$runId-revision"
  }
  Assert-Status $categoryPatch 200 'Edit category draft'

  $versionResponse = Invoke-Upload "$adminBase/documents/$documentId/versions" $adminHeaders $secondFile
  Assert-Status $versionResponse 201 'Upload draft version'
  $draft = Read-Json $versionResponse
  Assert-True ($draft.status -eq 'clean') 'The new working version must be clean.'
  Assert-True ($draft.hasUnpublishedChanges -eq $true) 'The admin must expose unpublished changes.'
  Assert-True (-not [string]::IsNullOrWhiteSpace($draft.publishedRevisionAt)) 'The old public revision disappeared.'

  Write-Host 'Proving that metadata, category and bytes stayed unchanged in public...'
  $unchangedLibraryResponse = Invoke-JsonRequest GET $publicBase $publicHeaders
  Assert-Status $unchangedLibraryResponse 200 'Read unchanged library'
  $unchangedLibrary = Read-Json $unchangedLibraryResponse
  $unchanged = $unchangedLibrary.documents | Where-Object id -EQ $documentId | Select-Object -First 1
  Assert-True ($unchanged.title -eq 'Documento público original') 'Draft title leaked into public Docs.'
  Assert-True ($unchanged.categoryName -eq 'Categoría pública original') 'Draft category leaked into public Docs.'
  $oldDownload = Invoke-WebRequest -Uri "$publicBase/$documentId/download" -Headers $publicHeaders -SkipHttpErrorCheck
  Assert-Status $oldDownload 200 'Download retained public version'
  Assert-True ($oldDownload.Content -match "PUBLIC ORIGINAL $runId") 'Draft file bytes leaked before publication.'

  Write-Host 'Publishing the new revision...'
  $republishResponse = Invoke-JsonRequest POST "$adminBase/documents/$documentId/publish" $adminHeaders @{}
  Assert-Status $republishResponse 200 'Publish revised document'
  $republished = Read-Json $republishResponse
  Assert-True ($republished.hasUnpublishedChanges -eq $false) 'The republished document is still dirty.'

  $revisedLibraryResponse = Invoke-JsonRequest GET $publicBase $publicHeaders
  Assert-Status $revisedLibraryResponse 200 'Read revised library'
  $revisedLibrary = Read-Json $revisedLibraryResponse
  $revised = $revisedLibrary.documents | Where-Object id -EQ $documentId | Select-Object -First 1
  Assert-True ($revised.title -eq 'Documento revisado todavía privado') 'The revised title was not published.'
  Assert-True ($revised.categoryName -eq 'Categoría todavía privada') 'The revised category was not published.'
  $newDownload = Invoke-WebRequest -Uri "$publicBase/$documentId/download" -Headers $publicHeaders -SkipHttpErrorCheck
  Assert-Status $newDownload 200 'Download revised public version'
  Assert-True ($newDownload.Content -match "PRIVATE DRAFT $runId") 'The revised bytes were not published.'

  $unpublishResponse = Invoke-JsonRequest POST "$adminBase/documents/$documentId/unpublish" $adminHeaders @{}
  Assert-Status $unpublishResponse 200 'Unpublish document'
  $withdrawn = Invoke-WebRequest -Uri "$publicBase/$documentId/download" -Headers $publicHeaders -SkipHttpErrorCheck
  Assert-Status $withdrawn 404 'Withdraw public document'

  Write-Host ''
  Write-Host 'Starter Docs draft isolation passed.' -ForegroundColor Green
  Write-Host "Document ID: $documentId"
  Write-Host 'Verified   : immutable metadata/category/file snapshot, republish and explicit unpublish'
}
finally {
  if (Test-Path -LiteralPath $tempDirectory) {
    $resolvedTemp = (Resolve-Path -LiteralPath $tempDirectory).Path
    $expectedRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolvedTemp.StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolvedTemp) -notlike 'lmwares-docs-*') {
      throw "Refusing to delete unexpected path: $resolvedTemp"
    }
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
