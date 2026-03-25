param(
    [switch]$SkipBuild,
    [switch]$SkipMigrations,
    [switch]$SkipSeed,
    [switch]$SkipSmokeCheck,
    [string]$BaseUrl = "http://localhost"
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    Write-Host "`n==> $Name"
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

function Assert-Command {
    param([string]$CommandName)

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $CommandName"
    }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Assert-Command -CommandName "docker"

if (-not (Test-Path (Join-Path $root ".env"))) {
    throw "Missing .env in repository root. Create it before starting the system."
}

$upArgs = @("compose", "up", "-d")
if (-not $SkipBuild) {
    $upArgs += "--build"
}

Invoke-Step -Name "Starting containers" -Action {
    docker @upArgs
}

if (-not $SkipMigrations) {
    Invoke-Step -Name "Applying migrations" -Action {
        docker compose exec backend alembic upgrade head
    }
}

if (-not $SkipSeed) {
    Invoke-Step -Name "Seeding baseline data" -Action {
        docker compose exec backend python -m app.scripts.seed_data
    }
}

if (-not $SkipSmokeCheck) {
    $smokeScript = Join-Path $root "infra\scripts\smoke_check.ps1"
    if (-not (Test-Path $smokeScript)) {
        throw "Smoke check script not found at $smokeScript"
    }

    Invoke-Step -Name "Running smoke checks" -Action {
        powershell -ExecutionPolicy Bypass -File $smokeScript -BaseUrl $BaseUrl
    }
}

Write-Host "`nLocal system startup completed successfully."
Write-Host "Frontend: $BaseUrl/"
Write-Host "Backend health: $BaseUrl/api/health"
