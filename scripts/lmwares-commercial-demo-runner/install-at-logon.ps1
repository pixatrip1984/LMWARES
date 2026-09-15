param(
  [string]$ProjectRoot = 'C:\dev\oracle',
  [string]$ShortcutName = 'LMWares Demo Runner.lnk',
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'
$supervisor = Join-Path $ProjectRoot 'scripts\lmwares-commercial-demo-runner\run-listener-hidden.ps1'
$envFile = Join-Path $ProjectRoot 'scripts\lmwares-commercial-demo-runner\.env'
if (-not (Test-Path -LiteralPath $supervisor)) { throw "No se encontró $supervisor" }
if (-not (Test-Path -LiteralPath $envFile)) { throw "No se encontró $envFile" }

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$startupDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)
if (-not $startupDirectory) { throw 'Windows no entregó la carpeta de Inicio del usuario.' }
$shortcutPath = Join-Path $startupDirectory $ShortcutName
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$supervisor`" -ProjectRoot `"$ProjectRoot`""

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.Description = 'Supervisor singleton de demos comerciales LMWares'
$shortcut.Save()

if (-not (Test-Path -LiteralPath $shortcutPath)) { throw 'No se pudo crear el acceso de Inicio del listener.' }
Write-Host "Listener instalado en Inicio: $shortcutPath"

if ($StartNow) {
  Start-Process -FilePath $powershell -ArgumentList $arguments -WorkingDirectory $ProjectRoot -WindowStyle Hidden
  Write-Host 'Supervisor del listener iniciado.'
}
