param(
  [string]$UserDataDir = 'C:\dev\lmwares-demo-brave-profile'
)

$profileArgument = "--user-data-dir=$UserDataDir"
$targets = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'brave.exe' -and
  $_.CommandLine -and
  $_.CommandLine.IndexOf($profileArgument, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
})

if ($targets.Count -eq 0) {
  Write-Output '{"status":"already_stopped"}'
  exit 0
}

foreach ($target in $targets) {
  Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Output (ConvertTo-Json -Compress @{ status = 'stopped'; processCount = $targets.Count })
