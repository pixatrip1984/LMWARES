param(
  [string]$ProjectRoot = 'C:\dev\oracle',
  [int]$RestartDelaySeconds = 5
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$runner = Join-Path $ProjectRoot 'scripts\lmwares-commercial-demo-runner\daemon.mjs'
$envFile = Join-Path $ProjectRoot 'scripts\lmwares-commercial-demo-runner\.env'
$controlDirectory = 'C:\dev\lmwares-demos\control'
$supervisorLogPath = Join-Path $controlDirectory 'listener-supervisor.log'
$stdoutLogPath = Join-Path $controlDirectory 'listener.out.log'
$stderrLogPath = Join-Path $controlDirectory 'listener.err.log'

if (-not (Test-Path -LiteralPath $runner)) { throw "No se encontró $runner" }
if (-not (Test-Path -LiteralPath $envFile)) { throw "No se encontró $envFile" }
New-Item -ItemType Directory -Path $controlDirectory -Force | Out-Null
Set-Location -LiteralPath $ProjectRoot

while ($true) {
  $startedAt = Get-Date -Format o
  Add-Content -LiteralPath $supervisorLogPath -Value "[$startedAt] supervisor: iniciando listener" -Encoding utf8
  if (Test-Path -LiteralPath $stdoutLogPath) { Move-Item -LiteralPath $stdoutLogPath -Destination "$stdoutLogPath.previous" -Force }
  if (Test-Path -LiteralPath $stderrLogPath) { Move-Item -LiteralPath $stderrLogPath -Destination "$stderrLogPath.previous" -Force }
  $child = Start-Process -FilePath $node `
    -ArgumentList @("--env-file-if-exists=$envFile", $runner) `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLogPath `
    -RedirectStandardError $stderrLogPath `
    -Wait `
    -PassThru
  $exitCode = $child.ExitCode
  Add-Content -LiteralPath $supervisorLogPath -Value "[$(Get-Date -Format o)] supervisor: listener terminó con código $exitCode" -Encoding utf8

  # Exit code 2 means another healthy singleton already owns the listener.
  if ($exitCode -eq 2) { exit 0 }
  Start-Sleep -Seconds ([Math]::Max(2, $RestartDelaySeconds))
}
