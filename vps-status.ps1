param(
  [string]$DropletIp = "",
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
$envMap = Get-EnvMap
$ip = Resolve-Ip -ProvidedIp $DropletIp -EnvMap $envMap
$pw = $envMap["DIGITAL_OCEAN_VPS_ROOT_PW"]
if (-not $pw) { throw "Missing DIGITAL_OCEAN_VPS_ROOT_PW in .env" }

$cmd = "cd /opt/salarysafe; docker compose ps; echo '---'; docker compose logs --tail=40 backend; echo '---'; docker compose logs --tail=40 nginx"
& plink.exe -ssh "root@$ip" -pw $pw -batch -hostkey $KnownHostKey $cmd
if ($LASTEXITCODE -ne 0) { throw "Remote status command failed" }

Write-Host "Checked VPS status on $ip"