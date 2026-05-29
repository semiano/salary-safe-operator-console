# SalarySafe

SalarySafe Operator Console is a business-facing operations surface for managing and supervising AI-assisted compensation negotiations. It provides a transparent view into how negotiation runs are configured, executed, and evaluated, so teams can understand outcomes rather than treat them as a black box.

The platform combines an operator UI with a structured backend workflow to expose negotiation mechanisms and underlying data structures in real time: case intake payloads, run configurations, message streams, artifacts, policy checks, and final recommendation reports. It is designed for experimentation, auditability, and repeatable decision support across compensation scenarios.

This repository is being implemented phase-by-phase following:
- IMPLEMENTATION_SEQUENCE.md
- SYSTEM_SPEC.md
- TODO.md

## Current status

Implemented through Phase 8 baseline:
- Backend foundation, core APIs, runtime/orchestration baseline
- SSE stream endpoint and run observability persistence
- Frontend operator pages for cases, run chat, report, and compare
- Seed data utility and backend test baseline

## Local run

1. Copy `.env.example` to `.env` (optional for defaults).
2. Start services:

```bash
docker compose up --build
```

One-command local startup (build, migrate, seed, smoke-check):

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

One-command local rebuild and verification (startup + backend tests + frontend smoke):

```powershell
powershell -ExecutionPolicy Bypass -File .\rebuild-and-verify-local.ps1
```

Services:
- postgres on `localhost:5432`
- backend on `localhost:8000`
- frontend on `localhost:5173`
- nginx on `localhost:80`

## Seed sample data

After migrations are applied and backend dependencies are installed, seed baseline prompt/config/case data:

```bash
cd apps/backend
python -m app.scripts.seed_data
```

This also seeds a default admin user for local PoC usage:
- email: `admin@salarysafe.dev`
- password: `admin123!`

Override with `.env` values:
- `ADMIN_SEED_EMAIL`
- `ADMIN_SEED_PASSWORD`

## Run tests

Backend tests:

```bash
cd apps/backend
python -m unittest discover -s tests -p "test_*.py"
```

Frontend build smoke test:

```bash
cd apps/frontend
npm run build
```

Frontend navigation smoke test (Playwright, against running stack at `http://localhost` by default):

```bash
cd apps/frontend
npm run test:smoke
```

Live container smoke tests (requires running `docker compose` stack):

```bash
python -m unittest discover -s infra/tests -p "test_*.py" -v
```

## Deployment prep

DigitalOcean droplet deployment checklist:
- `infra/do/droplet-deploy.md`
- `VPS_RUNBOOK.md`

PowerShell smoke check helper:

```powershell
./infra/scripts/smoke_check.ps1 -BaseUrl "http://localhost"
```

Reusable VPS operations scripts (repository root):

```powershell
# Fresh deploy/redeploy to DigitalOcean droplet
powershell -ExecutionPolicy Bypass -File .\deploy-vps.ps1

# Restart or rebuild remote services
powershell -ExecutionPolicy Bypass -File .\restart-vps-services.ps1
powershell -ExecutionPolicy Bypass -File .\restart-vps-services.ps1 -Rebuild

# Inspect remote status/logs and run smoke checks
powershell -ExecutionPolicy Bypass -File .\vps-status.ps1
powershell -ExecutionPolicy Bypass -File .\vps-logs.ps1 -Service backend -Tail 200
powershell -ExecutionPolicy Bypass -File .\vps-smoke-check.ps1
```

## Packaging and deploy

Container packaging and deploy flow:

1. Configure `.env` with production-safe values.
2. Build and start services:

```bash
docker compose up -d --build
```

3. Apply migrations and seed baseline data:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.seed_data
```

4. Verify health and logs:

```bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 nginx
```

5. Optional local cleanup/reset:

```bash
docker compose down
docker compose down -v
docker image prune -f
```

Remote VPS note:

1. Postgres is bound to VPS localhost (`127.0.0.1:5432`) rather than publicly exposed.
2. For direct local troubleshooting access, open an SSH tunnel with `powershell -ExecutionPolicy Bypass -File .\vps-db-tunnel.ps1` and connect your DB client to `localhost:5432`.

## External dependencies

Required to run negotiation with live model calls:

- One provider must be configured with valid credentials.
- `LLM_PROVIDER=openai` requires:
	- `OPENAI_API_KEY`
	- optional `OPENAI_MODEL` (default `gpt-4.1`)
- `LLM_PROVIDER=azure_openai` requires:
	- `AZURE_OPENAI_API_KEY`
	- `AZURE_OPENAI_ENDPOINT`
	- `AZURE_OPENAI_API_VERSION`
	- `AZURE_OPENAI_DEPLOYMENT_NAME`

Strongly recommended before non-local deployment:

- Set a strong `JWT_SECRET` (do not use `change_me`).
- Replace default admin seed credentials.
- Keep port 5432 private to trusted networks only.
