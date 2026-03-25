param(
  [string]$DropletIp = "",
  [string]$DropletName = "",
  [string]$KnownHostKey = "ssh-ed25519 255 SHA256:UN+/LAzII+KWo1LphiQbFcU1OQoQQ6gNZ51BmNxgx8g",
  [string]$RemotePath = "/opt/salarysafe",
  [switch]$SkipDockerBootstrap,
  [switch]$SkipSeed
)

$ErrorActionPreference = "Stop"

function Get-EnvMap {
  param([string]$EnvFile)
  $map = @{}
  foreach ($line in Get-Content $EnvFile) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
      continue
    }
    $parts = $line.Split("=", 2)
    if ($parts.Count -eq 2) {
      $map[$parts[0].Trim()] = $parts[1].Trim()
    }
  }
  return $map
}

function Resolve-DropletIp {
  param(
    [string]$ProvidedIp,
    [string]$ProvidedName,
    [hashtable]$EnvMap
  )

  if ($ProvidedIp) {
    return $ProvidedIp
  }

  $token = $EnvMap["DIGITAL_OCEAN_API_TOKEN"]
  if (-not $token) {
    throw "Missing DIGITAL_OCEAN_API_TOKEN in .env"
  }

  $name = $ProvidedName
  if (-not $name) {
    $name = $EnvMap["DIGITAL_OCEAN-DROPLET_ID"]
  }
  if (-not $name) {
    throw "Missing droplet name. Provide -DropletName or DIGITAL_OCEAN-DROPLET_ID in .env"
  }

  $headers = @{ Authorization = "Bearer $token" }
  $resp = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/droplets?per_page=200" -Headers $headers -Method Get
  $droplet = $resp.droplets | Where-Object { $_.name -eq $name } | Select-Object -First 1
  if (-not $droplet) {
    throw "Droplet '$name' not found in DigitalOcean account"
  }

  $ip = ($droplet.networks.v4 | Where-Object { $_.type -eq "public" } | Select-Object -First 1).ip_address
  if (-not $ip) {
    throw "Droplet '$name' does not have a public IPv4 address"
  }
  return $ip
}

function Invoke-Remote {
  param(
    [string]$Ip,
    [string]$Password,
    [string]$HostKey,
    [string]$Command
  )
  & plink.exe -ssh "root@$Ip" -pw $Password -batch -hostkey $HostKey $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Remote command failed"
  }
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if (-not (Get-Command plink.exe -ErrorAction SilentlyContinue)) {
  throw "plink.exe not found. Install PuTTY first."
}
if (-not (Get-Command pscp.exe -ErrorAction SilentlyContinue)) {
  throw "pscp.exe not found. Install PuTTY first."
}
if (-not (Test-Path ".env")) {
  throw "Missing .env at repository root"
}

$envMap = Get-EnvMap -EnvFile ".env"
$rootPassword = $envMap["DIGITAL_OCEAN_VPS_ROOT_PW"]
if (-not $rootPassword) {
  throw "Missing DIGITAL_OCEAN_VPS_ROOT_PW in .env"
}

$targetIp = Resolve-DropletIp -ProvidedIp $DropletIp -ProvidedName $DropletName -EnvMap $envMap
Write-Host "Deploy target: $targetIp"

$archivePath = Join-Path $env:TEMP "salarysafe-deploy.tgz"
if (Test-Path $archivePath) {
  Remove-Item $archivePath -Force
}

Set-Location (Split-Path -Parent $repoRoot)
$repoName = Split-Path -Leaf $repoRoot
tar -czf $archivePath `
  --exclude="$repoName/.git" `
  --exclude="$repoName/.venv" `
  --exclude="$repoName/apps/frontend/node_modules" `
  --exclude="$repoName/apps/frontend/dist" `
  --exclude="$repoName/apps/backend/__pycache__" `
  --exclude="$repoName/apps/backend/.pytest_cache" `
  $repoName
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create deployment archive"
}

Set-Location $repoRoot

$bootstrapScript = "infra/do/bootstrap-docker.sh"
if (-not (Test-Path $bootstrapScript)) {
  throw "Missing $bootstrapScript"
}

& pscp.exe -batch -pw $rootPassword -hostkey $KnownHostKey $bootstrapScript "root@${targetIp}:/root/bootstrap-docker.sh"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload bootstrap script"
}

& pscp.exe -batch -pw $rootPassword -hostkey $KnownHostKey $archivePath "root@${targetIp}:/root/salarysafe-deploy.tgz"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload deployment archive"
}

if (-not $SkipDockerBootstrap) {
  Invoke-Remote -Ip $targetIp -Password $rootPassword -HostKey $KnownHostKey -Command "chmod +x /root/bootstrap-docker.sh; command -v docker >/dev/null 2>&1 || /root/bootstrap-docker.sh"
}

$remoteDeploy = @(
  "set -e",
  "mkdir -p /opt",
  "rm -rf $RemotePath",
  "tar -xzf /root/salarysafe-deploy.tgz -C /opt",
  "mv /opt/$repoName $RemotePath",
  "cd $RemotePath",
  "docker compose up -d --build",
  "docker compose exec -T backend alembic upgrade head"
)

if (-not $SkipSeed) {
  $remoteDeploy += "docker compose exec -T backend python -m app.scripts.seed_data"
}

$remoteDeploy += "docker compose ps"

Invoke-Remote -Ip $targetIp -Password $rootPassword -HostKey $KnownHostKey -Command ($remoteDeploy -join "; ")

Write-Host "Running smoke checks against http://$targetIp"
powershell -ExecutionPolicy Bypass -File .\infra\scripts\smoke_check.ps1 -BaseUrl "http://$targetIp"

Write-Host "Deployment complete: http://$targetIp"