param(
  [string]$BrowserPath = 'C:\Users\DELL\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe',
  [string]$UserDataDir = 'C:\dev\lmwares-demo-brave-profile',
  [string]$ProfileDirectory = 'Default',
  [string]$ExtensionPath = 'C:\dev\lmwares\lmwares-chatgpt-demo-runner',
  [string]$ExtensionId = 'onnphmgblmlnecgmnknbhgflibbpckln',
  [ValidateSet('headless', 'interactive', 'isolated-desktop')]
  [string]$ExecutionMode = 'isolated-desktop',
  [int]$DebuggingPort = 9223
)

if (-not (Test-Path -LiteralPath $BrowserPath)) { throw "No se encontró Brave en: $BrowserPath" }
if (-not (Test-Path -LiteralPath (Join-Path $ExtensionPath 'manifest.json'))) { throw "No se encontró la extensión en: $ExtensionPath" }
if ($ExtensionId -notmatch '^[a-p]{32}$') { throw "El id de la extensión de Demo Studio no es válido." }
New-Item -ItemType Directory -Path $UserDataDir -Force | Out-Null

$profileArgument = "--user-data-dir=$UserDataDir"
$existing = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'brave.exe' -and $_.CommandLine -and
  $_.CommandLine -notmatch '(?:^|\s)--type=' -and
  $_.CommandLine.IndexOf($profileArgument, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
})

$initialUrl = if ($ExecutionMode -eq 'headless') { 'https://chatgpt.com/' } else { "chrome-extension://$ExtensionId/demo-popup.html?bootstrap=1" }

$arguments = @(
  "--user-data-dir=$UserDataDir",
  "--profile-directory=$ProfileDirectory",
  "--disable-extensions-except=$ExtensionPath",
  "--load-extension=$ExtensionPath",
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion',
  '--remote-debugging-address=127.0.0.1',
  "--remote-debugging-port=$DebuggingPort",
  $initialUrl
)
if ($ExecutionMode -eq 'headless') {
  $arguments += @('--headless=new', '--window-size=1440,1200', '--force-device-scale-factor=1')
} else {
  $arguments += '--new-window'
}

if ($existing.Count -eq 0) {
  if ($ExecutionMode -eq 'isolated-desktop') {
    $isolatedHost = Join-Path $PSScriptRoot 'run-isolated-desktop.ps1'
    if (-not (Test-Path -LiteralPath $isolatedHost)) { throw "No se encontró $isolatedHost" }
    $configuration = @{ browserPath = $BrowserPath; arguments = @($arguments); workingDirectory = (Split-Path -Parent $BrowserPath) } | ConvertTo-Json -Compress
    $encodedConfiguration = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($configuration))
    $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
    Start-Process -FilePath $powershell -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', $isolatedHost, '-EncodedConfiguration', $encodedConfiguration) -WindowStyle Hidden | Out-Null
  } else {
    $windowStyle = if ($ExecutionMode -eq 'headless') { 'Hidden' } else { 'Normal' }
    Start-Process -FilePath $BrowserPath -ArgumentList $arguments -WindowStyle $windowStyle | Out-Null
  }
} elseif ($existing.Count -gt 1) {
  throw "Multiple Brave processes use the dedicated Demo Studio profile: $($existing.Count)."
}

$syncScript = Join-Path $PSScriptRoot 'sync-browser-extension.mjs'
if (-not (Test-Path -LiteralPath $syncScript)) { throw "No se encontró el sincronizador de la extensión: $syncScript" }
$node = (Get-Command node -ErrorAction Stop).Source
& $node $syncScript '--extension-path' $ExtensionPath '--extension-id' $ExtensionId '--debug-url' "http://127.0.0.1:$DebuggingPort" '--execution-mode' $ExecutionMode
if ($LASTEXITCODE -ne 0) { throw "No se pudo sincronizar Demo Studio con Brave (código $LASTEXITCODE)." }
