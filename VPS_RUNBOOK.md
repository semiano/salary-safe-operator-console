# SalarySafe VPS Runbook

This runbook covers DigitalOcean droplet operations using root-level reusable PowerShell scripts in repository root.

## Prerequisites

1. Local machine has `plink.exe` and `pscp.exe` (PuTTY).
2. `.env` includes:
   - `DIGITAL_OCEAN_API_TOKEN`
   - `DIGITAL_OCEAN-DROPLET_ID` (droplet name)
   - `DIGITAL_OCEAN_VPS_ROOT_PW`
3. Droplet allows inbound ports `22`, `80`, `443` (443 optional for future TLS).

## One-command deploy / redeploy

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-vps.ps1
```

Options:

```powershell
# Explicit target IP
powershell -ExecutionPolicy Bypass -File .\deploy-vps.ps1 -DropletIp "159.65.237.234"

# Skip seeding data
powershell -ExecutionPolicy Bypass -File .\deploy-vps.ps1 -SkipSeed

# Skip Docker bootstrap if already installed
powershell -ExecutionPolicy Bypass -File .\deploy-vps.ps1 -SkipDockerBootstrap
```

What deploy does:

1. Packages repo (excluding `.git`, `.venv`, `node_modules`, build artifacts).
2. Uploads package + `infra/do/bootstrap-docker.sh` to droplet.
3. Installs Docker/Compose if missing (unless skipped).
4. Extracts to `/opt/salarysafe`.
5. Runs `docker compose up -d --build`.
6. Runs migrations and seed script.
7. Executes smoke checks against droplet public URL.

## Restart services

```powershell
# Restart containers only
powershell -ExecutionPolicy Bypass -File .\restart-vps-services.ps1

# Rebuild images and restart
powershell -ExecutionPolicy Bypass -File .\restart-vps-services.ps1 -Rebuild
```

## Status and logs

```powershell
# Compose status + backend/nginx tail logs
powershell -ExecutionPolicy Bypass -File .\vps-status.ps1

# Tail all logs
powershell -ExecutionPolicy Bypass -File .\vps-logs.ps1

# Tail one service
powershell -ExecutionPolicy Bypass -File .\vps-logs.ps1 -Service backend -Tail 200

# Follow logs (non-batch usage)
powershell -ExecutionPolicy Bypass -File .\vps-logs.ps1 -Service nginx -Follow
```

## Smoke check

```powershell
powershell -ExecutionPolicy Bypass -File .\vps-smoke-check.ps1
```

## Emergency recovery flow

1. Check status: `./vps-status.ps1`
2. Inspect backend logs: `./vps-logs.ps1 -Service backend -Tail 300`
3. Rebuild/restart: `./restart-vps-services.ps1 -Rebuild`
4. If still broken, perform fresh redeploy: `./deploy-vps.ps1`
5. Verify health: `./vps-smoke-check.ps1`

## Security notes

1. Rotate any credentials that were shared in plaintext.
2. Move production secrets to a secret manager ASAP.
3. Avoid storing cloud admin credentials in `.env` long-term.
4. Configure TLS and firewall hardening before internet-facing production use.