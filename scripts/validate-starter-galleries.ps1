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

function Invoke-FileUpload {
  param(
    [Parameter(Mandatory)] [string]$Uri,
    [Parameter(Mandatory)] [hashtable]$Headers,
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$Alt
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
  $startInfo.ArgumentList.Add(
    "file=@$Path;type=image/png;filename=$([System.IO.Path]::GetFileName($Path))"
  )
  $startInfo.ArgumentList.Add('--form-string')
  $startInfo.ArgumentList.Add("alt=$Alt")
  $startInfo.ArgumentList.Add($Uri)

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $process.Start() | Out-Null
  $output = $process.StandardOutput.ReadToEnd()
  $errorOutput = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "curl upload failed with exit $($process.ExitCode): $errorOutput"
  }
  if ($output -notmatch '(?s)^(.*)\r?\n([0-9]{3})$') {
    throw "Could not parse curl upload response: $output"
  }
  [pscustomobject]@{
    StatusCode = [int]$Matches[2]
    Content = $Matches[1]
  }
}

function Assert-True {
  param(
    [Parameter(Mandatory)] [bool]$Condition,
    [Parameter(Mandatory)] [string]$Message
  )
  if (-not $Condition) { throw $Message }
}

function New-MinimalPng {
  param([Parameter(Mandatory)] [string]$Path)

  # El validador del Worker exige firma PNG e IHDR con al menos 32x32 px.
  $bytes = [byte[]]@(
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 32, 0, 0, 0, 32
  )
  [System.IO.File]::WriteAllBytes($Path, $bytes)
}

$adminHeaders = @{
  Origin = $AdminOrigin
  'X-Dev-Email' = $DevEmail
}
$publicHeaders = @{ Origin = $PublicOrigin }
$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmssfff')
$originalSlug = "starter-gallery-e2e-$runId"
$revisedSlug = "$originalSlug-revision"
$adminBase = "$AdminApiUrl/admin/projects/$ProjectId/modules/galleries"
$publicBase = "$PublicApiUrl/sites/$ProjectId/galleries"
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "lmwares-gallery-$runId"
$firstFile = Join-Path $tempDirectory 'first.png'
$secondFile = Join-Path $tempDirectory 'second.png'

New-Item -ItemType Directory -Path $tempDirectory | Out-Null
New-MinimalPng $firstFile
New-MinimalPng $secondFile

try {
  Write-Host 'Creating gallery draft and uploading two images...'
  $createResponse = Invoke-JsonRequest POST $adminBase $adminHeaders @{
    slug = $originalSlug
    title = 'Galería publicada original'
    description = 'Primera revisión pública de la prueba E2E.'
    category = 'Validación'
    sortOrder = 0
  }
  Assert-Status $createResponse 201 'Create gallery'
  $created = Read-Json $createResponse
  $albumId = $created.id
  $albumAdminUrl = "$adminBase/$albumId"

  $firstUpload = Invoke-FileUpload `
    -Uri "$albumAdminUrl/images" -Headers $adminHeaders `
    -Path $firstFile -Alt 'Primera imagen original'
  Assert-Status $firstUpload 201 'Upload first image'
  $firstImage = Read-Json $firstUpload

  $secondUpload = Invoke-FileUpload `
    -Uri "$albumAdminUrl/images" -Headers $adminHeaders `
    -Path $secondFile -Alt 'Segunda imagen original'
  Assert-Status $secondUpload 201 'Upload second image'
  $secondImage = Read-Json $secondUpload

  Write-Host 'Publishing the immutable baseline...'
  $publishResponse = Invoke-JsonRequest POST "$albumAdminUrl/publish" $adminHeaders @{}
  Assert-Status $publishResponse 200 'Publish baseline'
  $published = Read-Json $publishResponse
  Assert-True ($published.hasUnpublishedChanges -eq $false) 'The fresh publication is unexpectedly dirty.'

  $baselineResponse = Invoke-JsonRequest GET "$publicBase/$originalSlug" $publicHeaders
  Assert-Status $baselineResponse 200 'Read baseline publication'
  $baseline = Read-Json $baselineResponse
  Assert-True ($baseline.images.Count -eq 2) 'The baseline must contain two images.'
  Assert-True ($baseline.coverImageId -eq $firstImage.id) 'The first image must be the baseline cover.'
  $retainedPublicUrl = $baseline.images[0].url

  Write-Host 'Editing metadata, alt text, order, cover and deleting one draft image...'
  $updateResponse = Invoke-JsonRequest PATCH $albumAdminUrl $adminHeaders @{
    slug = $revisedSlug
    title = 'Galería revisada todavía en borrador'
    description = 'Esta revisión no debe filtrarse antes de publicar.'
  }
  Assert-Status $updateResponse 200 'Update draft metadata'

  $altResponse = Invoke-JsonRequest PATCH `
    "$albumAdminUrl/images/$($secondImage.id)" $adminHeaders @{
      alt = 'Segunda imagen revisada'
    }
  Assert-Status $altResponse 200 'Update draft alt text'

  $orderResponse = Invoke-JsonRequest PATCH "$albumAdminUrl/images/order" $adminHeaders @{
    imageIds = @($secondImage.id, $firstImage.id)
  }
  Assert-Status $orderResponse 200 'Reorder draft images'

  $coverResponse = Invoke-JsonRequest PATCH "$albumAdminUrl/cover" $adminHeaders @{
    imageId = $secondImage.id
  }
  Assert-Status $coverResponse 200 'Change draft cover'

  $deleteResponse = Invoke-JsonRequest DELETE `
    "$albumAdminUrl/images/$($firstImage.id)" $adminHeaders
  Assert-Status $deleteResponse 204 'Delete image from draft'

  $draftResponse = Invoke-JsonRequest POST "$albumAdminUrl/draft" $adminHeaders @{}
  Assert-Status $draftResponse 200 'Save isolated draft'
  $draft = Read-Json $draftResponse
  Assert-True ($draft.status -eq 'published') 'A live album must remain published while its next revision is a draft.'
  Assert-True ($draft.hasUnpublishedChanges -eq $true) 'The admin must expose unpublished changes.'
  Assert-True (-not [string]::IsNullOrWhiteSpace($draft.publishedRevisionAt)) 'The live revision timestamp is missing.'

  Write-Host 'Proving that the public revision did not change...'
  $unchangedResponse = Invoke-JsonRequest GET "$publicBase/$originalSlug" $publicHeaders
  Assert-Status $unchangedResponse 200 'Read unchanged public revision'
  $unchanged = Read-Json $unchangedResponse
  Assert-True ($unchanged.title -eq 'Galería publicada original') 'Draft metadata leaked into the public title.'
  Assert-True ($unchanged.images.Count -eq 2) 'Draft deletion leaked into the public image list.'
  Assert-True ($unchanged.images[1].alt -eq 'Segunda imagen original') 'Draft alt text leaked into the public revision.'
  Assert-True ($unchanged.coverImageId -eq $firstImage.id) 'Draft cover leaked into the public revision.'

  $futureSlugResponse = Invoke-JsonRequest GET "$publicBase/$revisedSlug" $publicHeaders
  Assert-Status $futureSlugResponse 404 'Hide draft slug'
  $retainedAssetResponse = Invoke-WebRequest -Method GET -Uri $retainedPublicUrl -SkipHttpErrorCheck
  Assert-Status $retainedAssetResponse 200 'Retain an asset referenced by the public snapshot'

  $listResponse = Invoke-JsonRequest GET $adminBase $adminHeaders
  Assert-Status $listResponse 200 'Read admin gallery list'
  $list = Read-Json $listResponse
  $liveSummary = $list.publishedAlbums | Where-Object id -EQ $albumId | Select-Object -First 1
  Assert-True ($null -ne $liveSummary) 'The admin did not return the exact live snapshot.'
  Assert-True ($liveSummary.title -eq 'Galería publicada original') 'The admin live preview is showing draft metadata.'

  Write-Host 'Publishing the revision and cleaning the old asset...'
  $republishResponse = Invoke-JsonRequest POST "$albumAdminUrl/publish" $adminHeaders @{}
  Assert-Status $republishResponse 200 'Republish gallery'
  $republished = Read-Json $republishResponse
  Assert-True ($republished.hasUnpublishedChanges -eq $false) 'The republished revision is still marked dirty.'

  $revisedResponse = Invoke-JsonRequest GET "$publicBase/$revisedSlug" $publicHeaders
  Assert-Status $revisedResponse 200 'Read revised publication'
  $revised = Read-Json $revisedResponse
  Assert-True ($revised.title -eq 'Galería revisada todavía en borrador') 'The revised title was not published.'
  Assert-True ($revised.images.Count -eq 1) 'The revised publication must contain one image.'
  Assert-True ($revised.images[0].id -eq $secondImage.id) 'The wrong image survived republication.'
  Assert-True ($revised.images[0].alt -eq 'Segunda imagen revisada') 'The revised alt text was not published.'
  Assert-True ($revised.coverImageId -eq $secondImage.id) 'The revised cover was not published.'

  $oldSlugResponse = Invoke-JsonRequest GET "$publicBase/$originalSlug" $publicHeaders
  Assert-Status $oldSlugResponse 404 'Retire old public slug'
  $removedAssetResponse = Invoke-WebRequest -Method GET -Uri $retainedPublicUrl -SkipHttpErrorCheck
  Assert-Status $removedAssetResponse 404 'Delete asset after the final public reference disappears'

  Write-Host ''
  Write-Host 'Starter Galleries draft isolation passed.' -ForegroundColor Green
  Write-Host "Album ID : $albumId"
  Write-Host "Live slug: $revisedSlug"
  Write-Host 'Verified : immutable public snapshot, metadata/order/cover/alt/delete isolation, exact admin live preview, republish and R2 cleanup'
}
finally {
  if (Test-Path -LiteralPath $tempDirectory) {
    $resolvedTemp = (Resolve-Path -LiteralPath $tempDirectory).Path
    $resolvedRoot = (Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())).Path
    if ($resolvedTemp.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
  }
}
