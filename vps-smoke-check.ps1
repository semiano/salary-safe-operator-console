param(
  [string]$DropletIp = ""
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

powershell -ExecutionPolicy Bypass -File .\infra\scripts\smoke_check.ps1 -BaseUrl "http://$ip"