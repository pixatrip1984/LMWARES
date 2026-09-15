param(
  [string]$BrowserPath = 'C:\Users\DELL\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe',
  [string]$UserDataDir = 'C:\dev\lmwares-demo-brave-profile',
  [string]$ProfileDirectory = 'Default',
  [string]$ExtensionPath = 'C:\dev\lmwares\lmwares-chatgpt-demo-runner',
  [string]$ExtensionId = 'onnphmgblmlnecgmnknbhgflibbpckln'
)

if (-not (Test-Path -LiteralPath $BrowserPath)) { throw "No se encontró Brave en: $BrowserPath" }
if (-not (Test-Path -LiteralPath (Join-Path $ExtensionPath 'manifest.json'))) { throw "No se encontró la extensión en: $ExtensionPath" }
if ($ExtensionId -notmatch '^[a-p]{32}$') { throw "El id de la extensión de Demo Studio no es válido." }
New-Item -ItemType Directory -Path $UserDataDir -Force | Out-Null

$arguments = @(
  "--user-data-dir=$UserDataDir",
  "--profile-directory=$ProfileDirectory",
  "--load-extension=$ExtensionPath",
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion',
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=9223',
  '--new-window',
  'about:blank'
)
Start-Process -FilePath $BrowserPath -ArgumentList $arguments -WindowStyle Normal

$syncScript = Join-Path $PSScriptRoot 'sync-browser-extension.mjs'
if (-not (Test-Path -LiteralPath $syncScript)) { throw "No se encontró el sincronizador de la extensión: $syncScript" }
$node = (Get-Command node -ErrorAction Stop).Source
& $node $syncScript '--extension-path' $ExtensionPath '--extension-id' $ExtensionId
if ($LASTEXITCODE -ne 0) { throw "No se pudo sincronizar Demo Studio con Brave (código $LASTEXITCODE)." }
