param(
    [string]$BaseUrl = "http://localhost"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "==> Rebuild and start local stack"
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -BaseUrl $BaseUrl
if ($LASTEXITCODE -ne 0) {
    throw "start-local.ps1 failed with exit code $LASTEXITCODE"
}

Write-Host "`n==> Backend tests"
Set-Location (Join-Path $root "apps\backend")
c:/python313/python.exe -m unittest discover -s tests -p "test_*.py" -v
if ($LASTEXITCODE -ne 0) {
    throw "Backend tests failed with exit code $LASTEXITCODE"
}

Write-Host "`n==> Frontend smoke test"
Set-Location (Join-Path $root "apps\frontend")
npm run test:smoke
if ($LASTEXITCODE -ne 0) {
    throw "Frontend smoke test failed with exit code $LASTEXITCODE"
}

Write-Host "`nRebuild and verification completed successfully."
Write-Host "Frontend: $BaseUrl/"
Write-Host "Backend health: $BaseUrl/api/health"
