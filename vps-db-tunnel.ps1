param(
  [string]$DropletIp = "",
  [int]$LocalPort = 5432,
  [int]$RemotePort = 5432,
  [string]$KnownHostKey = "ssh-ed25519 255 SHA256:UN+/LAzII+KWo1LphiQbFcU1OQoQQ6gNZ51BmNxgx8g"
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

function Resolve-Ip([string]$ProvidedIp, [hashtable]$EnvMap) {
  if ($ProvidedIp) { return $ProvidedIp }
  $token = $EnvMap["DIGITAL_OCEAN_API_TOKEN"]
  $name = $EnvMap["DIGITAL_OCEAN-DROPLET_ID"]
  if (-not $token -or -not $name) { throw "Missing droplet details in .env" }
  $headers = @{ Authorization = "Bearer $token" }
  $resp = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/droplets?per_page=200" -Headers $headers -Method Get
  $droplet = $resp.droplets | Where-Object { $_.name -eq $name } | Select-Object -First 1
  if (-not $droplet) { throw "Droplet '$name' not found" }
  return ($droplet.networks.v4 | Where-Object { $_.type -eq "public" } | Select-Object -First 1).ip_address
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if (-not (Get-Command plink.exe -ErrorAction SilentlyContinue)) {
  throw "plink.exe not found. Install PuTTY first."
}

$envMap = Get-EnvMap
$ip = Resolve-Ip -ProvidedIp $DropletIp -EnvMap $envMap
$pw = $envMap["DIGITAL_OCEAN_VPS_ROOT_PW"]
if (-not $pw) { throw "Missing DIGITAL_OCEAN_VPS_ROOT_PW in .env" }

Write-Host "Opening DB tunnel: localhost:$LocalPort -> $ip:127.0.0.1:$RemotePort"
Write-Host "Leave this terminal running while GHCP or psql connects to localhost:$LocalPort"

# -N: no remote command, tunnel only.
& plink.exe -ssh "root@$ip" -pw $pw -batch -hostkey $KnownHostKey -N -L "${LocalPort}:127.0.0.1:${RemotePort}"
if ($LASTEXITCODE -ne 0) { throw "Tunnel closed with error" }
