# Test Plan

Testing strategy baseline is in [SYSTEM_SPEC.md](../SYSTEM_SPEC.md), Section 27.
Project tests will be added incrementally alongside each implementation phase.

## Phase 8 Validation Checklist (2026-03-25)

This checklist captures the latest acceptance-oriented verification commands and outcomes for local Docker runtime.

### Backend Tests

Command:

```bash
cd apps/backend
python -m unittest discover -s tests -p "test_*.py" -v
```

Outcome:
- PASS (4 tests)
- Includes API flow and stream endpoint coverage

### Frontend Build

Command:

```bash
cd apps/frontend
npm run build
```

Outcome:
- PASS

### Frontend Smoke Navigation (Playwright)

Commands:

```bash
cd apps/frontend
npm run test:smoke
```

Outcome:
- PASS (1 test)
- Flow validated: login -> cases -> case editor -> back to cases -> logout

### Live Container Smoke Checks

Command:

```powershell
./infra/scripts/smoke_check.ps1 -BaseUrl "http://localhost"
```

Outcome:
- PASS
- Verified:
	- frontend root via nginx
	- backend health via nginx (`/api/health`)
	- backend direct health (`:8000/health`)

### Auth Runtime Verification

Commands:

```bash
docker compose exec backend python -m app.scripts.seed_data
```

```text
POST /api/auth/login   -> 200
GET  /api/auth/me      -> 200 (with bearer token)
```

Outcome:
- PASS
- Seeded admin credentials validated end-to-end through nginx proxy
