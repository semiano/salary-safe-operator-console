param(
  [string]$BaseUrl = "",
  [int]$LocalDbPort = 5432
)

$ErrorActionPreference = "Stop"

function Get-EnvMap {
  $map = @{}
  foreach ($line in Get-Content ".env") {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) { continue }
    $parts = $line.Split("=", 2)
    if ($parts.Count -eq 2) { $map[$parts[0].Trim()] = $parts[1].Trim() }
  }
  return $map
}

function Resolve-BaseUrl([string]$ProvidedBaseUrl, [hashtable]$EnvMap) {
  if (-not [string]::IsNullOrWhiteSpace($ProvidedBaseUrl)) {
    return $ProvidedBaseUrl.TrimEnd("/")
  }

  $token = $EnvMap["DIGITAL_OCEAN_API_TOKEN"]
  $name = $EnvMap["DIGITAL_OCEAN-DROPLET_ID"]
  if (-not $token -or -not $name) {
    throw "Missing DIGITAL_OCEAN_API_TOKEN or DIGITAL_OCEAN-DROPLET_ID in .env. Pass -BaseUrl instead."
  }

  $headers = @{ Authorization = "Bearer $token" }
  $resp = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/droplets?per_page=200" -Headers $headers -Method Get
  $droplet = $resp.droplets | Where-Object { $_.name -eq $name } | Select-Object -First 1
  if (-not $droplet) {
    throw "Droplet '$name' not found in DigitalOcean account"
  }

  $ip = ($droplet.networks.v4 | Where-Object { $_.type -eq "public" } | Select-Object -First 1).ip_address
  if (-not $ip) {
    throw "Droplet '$name' has no public IPv4"
  }

  return "http://$ip"
}

function Resolve-PythonExe {
  $venvPython = Join-Path (Get-Location) ".venv\Scripts\python.exe"
  if (Test-Path $venvPython) {
    return $venvPython
  }

  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCmd) {
    return $pythonCmd.Source
  }

  throw "Python not found. Activate .venv or install Python."
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if (-not (Test-Path ".env")) {
  throw "Missing .env at repository root"
}

$envMap = Get-EnvMap
$resolvedBaseUrl = Resolve-BaseUrl -ProvidedBaseUrl $BaseUrl -EnvMap $envMap

$dbName = $envMap["POSTGRES_DB"]
$dbUser = $envMap["POSTGRES_USER"]
$dbPassword = $envMap["POSTGRES_PASSWORD"]
$adminEmail = $envMap["ADMIN_SEED_EMAIL"]
$adminPassword = $envMap["ADMIN_SEED_PASSWORD"]

if (-not $dbName -or -not $dbUser -or -not $dbPassword) {
  throw "Missing one of POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD in .env"
}
if (-not $adminEmail -or -not $adminPassword) {
  throw "Missing one of ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD in .env"
}

Write-Host "Step 1/3: checking local DB tunnel on localhost:$LocalDbPort"
$tunnelCheck = Test-NetConnection 127.0.0.1 -Port $LocalDbPort
if (-not $tunnelCheck.TcpTestSucceeded) {
  throw "DB tunnel is not open on localhost:$LocalDbPort. Start it with .\\vps-db-tunnel.ps1 first."
}

Write-Host "Step 2/3: verifying DB query over tunnel"
$pythonExe = Resolve-PythonExe
$env:SS_DB_PASSWORD = $dbPassword
& $pythonExe -c "import os,sys; import psycopg; port=int(sys.argv[1]); db=sys.argv[2]; user=sys.argv[3]; pwd=os.environ['SS_DB_PASSWORD']; conn=psycopg.connect(host='127.0.0.1', port=port, dbname=db, user=user, password=pwd); cur=conn.cursor(); cur.execute('select 1'); row=cur.fetchone(); conn.close(); print(f'DB_OK:{row[0]}')" "$LocalDbPort" "$dbName" "$dbUser"
if ($LASTEXITCODE -ne 0) {
  Remove-Item Env:SS_DB_PASSWORD -ErrorAction SilentlyContinue
  throw "DB connectivity test failed over tunnel"
}
Remove-Item Env:SS_DB_PASSWORD -ErrorAction SilentlyContinue

Write-Host "Step 3/3: verifying VPS login endpoint"
$body = @{ email = $adminEmail; password = $adminPassword } | ConvertTo-Json
try {
  $loginResp = Invoke-RestMethod -Uri "$resolvedBaseUrl/api/auth/login" -Method Post -ContentType "application/json" -Body $body
  if (-not $loginResp.access_token) {
    throw "Login response missing access_token"
  }
  Write-Host "LOGIN_OK"
} catch {
  throw "Login endpoint check failed at $resolvedBaseUrl/api/auth/login"
}

Write-Host "HEALTH_OK: tunnel DB + auth endpoint are working"
