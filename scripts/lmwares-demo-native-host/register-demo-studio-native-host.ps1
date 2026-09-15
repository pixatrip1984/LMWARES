param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [ValidateSet('Brave', 'Chrome', 'Both')][string]$Browser = 'Brave'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$template = Join-Path $PSScriptRoot 'com.lmwares.demo_studio.template.json'
$target = Join-Path $PSScriptRoot 'com.lmwares.demo_studio.json'
$manifest = Get-Content -LiteralPath $template -Raw | ConvertFrom-Json
$manifest.allowed_origins = @("chrome-extension://$ExtensionId/")
$manifestJson = $manifest | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText(
  $target,
  ($manifestJson + [Environment]::NewLine),
  [System.Text.UTF8Encoding]::new($false)
)

$keys = @()
# Chromium browsers do not always consult the same registry view.  Registering the
# same private manifest in their documented per-user locations is deliberate: it
# does not broaden allowed_origins, and all locations resolve to the same host.
if ($Browser -in @('Brave', 'Both')) {
  $keys += @(
    'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.lmwares.demo_studio',
    'HKCU:\Software\Wow6432Node\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.lmwares.demo_studio'
  )
}
if ($Browser -in @('Chrome', 'Both')) {
  $keys += @(
    'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.lmwares.demo_studio',
    'HKCU:\Software\Wow6432Node\Google\Chrome\NativeMessagingHosts\com.lmwares.demo_studio',
    'HKCU:\Software\Chromium\NativeMessagingHosts\com.lmwares.demo_studio',
    'HKCU:\Software\Wow6432Node\Chromium\NativeMessagingHosts\com.lmwares.demo_studio'
  )
}
foreach ($key in $keys) {
  New-Item -Path $key -Force | Out-Null
  New-ItemProperty -Path $key -Name '(Default)' -Value $target -PropertyType String -Force | Out-Null
}
Write-Host "Bridge registered for $Browser. Manifest: $target"
