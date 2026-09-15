param(
  [Parameter(Mandatory = $true)]
  [string]$EncodedConfiguration
)

$ErrorActionPreference = 'Stop'
$configuration = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EncodedConfiguration)) | ConvertFrom-Json
$source = Join-Path $PSScriptRoot 'isolated-desktop-host.cs'
if (-not (Test-Path -LiteralPath $source)) { throw "No se encontró $source" }
Add-Type -Path $source
$desktopName = "LMWaresDemoStudio-$([Guid]::NewGuid().ToString('N'))"
[void][Lmwares.DemoStudio.IsolatedDesktopHost]::LaunchAndWait(
  [string]$configuration.browserPath,
  [string[]]@($configuration.arguments),
  [string]$configuration.workingDirectory,
  $desktopName
)
