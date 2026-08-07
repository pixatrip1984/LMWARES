[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$steps = @(
    @{ Name = 'lint'; Arguments = @('run', 'lint') }
    @{ Name = 'typecheck'; Arguments = @('run', 'typecheck') }
    @{ Name = 'tests'; Arguments = @('test') }
    @{ Name = 'build'; Arguments = @('run', 'build') }
    @{ Name = 'workers dry-run'; Arguments = @('run', 'check:workers') }
    @{ Name = 'maintenance policy'; Arguments = @('run', 'lmwares:maintenance:validate') }
)

Push-Location $repoRoot
try {
    Write-Output 'LMWARES_RELEASE_VALIDATION'
    Write-Output "REPOSITORY=$repoRoot"

    foreach ($step in $steps) {
        Write-Output "STEP_START=$($step.Name)"
        [string[]]$stepArguments = $step.Arguments
        & npm @stepArguments
        if ($LASTEXITCODE -ne 0) {
            throw "La validación '$($step.Name)' falló con código $LASTEXITCODE."
        }
        Write-Output "STEP_OK=$($step.Name)"
    }

    Write-Output 'RELEASE_VALIDATION=OK'
}
finally {
    Pop-Location
}
