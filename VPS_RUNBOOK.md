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

## Secure DB access from local GHCP

Use a local SSH tunnel when you need direct Postgres access for troubleshooting or seeding. This keeps Postgres private on the VPS while still allowing local tooling access.

```powershell
# Open tunnel (keep terminal open)
powershell -ExecutionPolicy Bypass -File .\vps-db-tunnel.ps1

# Example: connect from local psql/GHCP to localhost:5432
# host=localhost port=5432 dbname=salary_negotiation user=postgres password=<POSTGRES_PASSWORD>
```

Notes:

1. The tunnel forwards local `localhost:5432` to VPS `127.0.0.1:5432`.
2. Stop the tunnel by closing the terminal where `vps-db-tunnel.ps1` is running.
3. This replaces exposing Postgres publicly on `0.0.0.0:5432`.

## One-command tunnel and auth health check

After opening the tunnel, run this from your local machine to validate both DB access over the tunnel and VPS login API:

```powershell
powershell -ExecutionPolicy Bypass -File .\vps-auth-db-health.ps1
```

Optional explicit URL:

```powershell
powershell -ExecutionPolicy Bypass -File .\vps-auth-db-health.ps1 -BaseUrl "http://<your-vps-ip>"
```

## Smoke check

```powershell
powershell -ExecutionPolicy Bypass -File .\vps-smoke-check.ps1
```

By default the smoke check verifies the public nginx root and `/api/health` path only. The old localhost backend probe is still available as an opt-in diagnostic via `infra/scripts/smoke_check.ps1 -IncludeLocalDirectHealth`.

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