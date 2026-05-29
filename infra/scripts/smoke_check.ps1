param(
    [string]$BaseUrl = "http://localhost"
    ,[switch]$IncludeLocalDirectHealth
    ,[string]$LocalHealthUrl = "http://localhost:8000/health"
)

$ErrorActionPreference = "Stop"

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
            Write-Host "[PASS] $Name -> $Url ($($response.StatusCode))"
            return $true
        }

        Write-Host "[FAIL] $Name -> $Url returned status $($response.StatusCode)"
        return $false
    }
    catch {
        Write-Host "[FAIL] $Name -> $Url error: $($_.Exception.Message)"
        return $false
    }
}

$allPassed = $true
$allPassed = (Test-Endpoint -Name "Nginx root" -Url "$BaseUrl/") -and $allPassed
$allPassed = (Test-Endpoint -Name "Backend health via Nginx" -Url "$BaseUrl/api/health") -and $allPassed

if ($IncludeLocalDirectHealth) {
    $allPassed = (Test-Endpoint -Name "Backend direct health" -Url $LocalHealthUrl) -and $allPassed
}

if ($allPassed) {
    Write-Host "Smoke checks passed."
    exit 0
}

Write-Host "Smoke checks failed."
exit 1
