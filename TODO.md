# SalarySafe Implementation Todo

## Current Phase
- Phase 8 - Testing and Deployment (closeout)

## In Progress
- Phase 8 closeout and deployment handoff notes

## Next Steps
- Optional: add CI workflow to run backend tests + frontend smoke test on pull requests
- Optional: harden production posture (TLS termination, managed Postgres, secret manager integration)

## Completed
- Read governing docs and confirmed build order from implementation sequence
- Phase 1 Step 1 completed: repository structure scaffolded under `apps`, `infra`, and `docs`
- Phase 1 Step 2 completed: root `docker-compose.yml`, backend/frontend Dockerfiles, and nginx config implemented
- Docker Compose configuration validated successfully with `docker compose config`
- Phase 2 Step 3 completed: FastAPI base scaffold with settings loader, logging setup, health endpoint, router registration, and required route modules
- Phase 2 Step 4 completed: SQLAlchemy models, DB session management, Alembic scaffold, and initial migration for required tables
- Phase 2 Step 5 completed: Pydantic request/response schemas and strict final report validator implemented
- Backend Python syntax validation passed via `python -m compileall apps/backend/app`
- Phase 3 Step 6 completed: authentication schema/service/security primitives, login and me endpoints, and protected route dependencies
- Phase 3 Step 7 completed: case management CRUD endpoints (`POST/GET/GET by id/PUT`) with service-layer business logic
- Phase 3 Step 8 completed: prompt set CRUD and run config create/list endpoints with explicit Pydantic contracts
- Phase 4 Step 9 completed: baseline system prompt files created for all five required agents
- Phase 4 Step 10 completed: LLM provider abstraction with OpenAI/Azure OpenAI implementations and provider selection
- Phase 4 Step 11 completed: agent factory implemented with prompt loading, provider binding, config attachment, and required agent set construction
- Phase 5 Step 12 completed (scaffold): negotiation runner loads case/config/prompt set, creates agents, manages run lifecycle states, persists artifacts/messages, validates and stores final report shape
- Phase 5 progress: run routes now expose create-run from case, run detail, messages, artifacts, and report retrieval endpoints
- Phase 5 Step 13 completed (deterministic baseline): guided bounded rounds implemented with intake/openings/policy review/round synthesis and final state tracking
- Phase 5 Step 14 completed (baseline): repeated-position deadlock detection and round-level policy review wired into orchestration flow
- Phase 5 Step 15 completed (baseline): final report synthesized from workflow state, validated with Pydantic, and persisted
- Phase 6 Step 16 completed: runner persists per-phase and per-round messages/artifacts into `run_messages` and `run_artifacts`
- Phase 6 Step 17 completed: SSE endpoint `GET /api/runs/{run_id}/stream` emits status/message/artifact/completion events
- Phase 7 Step 18 completed: React + TypeScript + Vite + Tailwind + React Query frontend scaffold created and production build verified
- Phase 7 Step 19 completed (baseline): case editor now loads case detail, edits candidate/company payload JSON, saves updates, selects prompt/config, and launches runs
- Phase 7 Step 20 completed (baseline): run view now renders live chat/debug panes and consumes SSE stream events with query fallback
- Phase 7 Step 21 completed (baseline): implemented `/runs/:runId/report` and `/runs/:runId/compare` pages with route wiring and API integration (`/api/runs/{run_id}/report`, `/api/cases/{case_id}/runs`)
- Phase 8 Step 22 completed: added backend seed utility (`python -m app.scripts.seed_data`) for one prompt set, baseline run configs, and five canonical negotiation cases
- Phase 8 Step 23 completed (baseline): added and executed backend unit tests for deadlock detection + workflow report validation (`apps/backend/tests/test_orchestration.py`)
- Verification run (2026-03-25): backend unit tests pass (`python -m unittest discover -s tests -p "test_*.py"`), backend compile sanity passes, and frontend production build smoke passes (`npm run build`)
- Verification run (2026-03-25): API integration-style flow test (`apps/backend/tests/test_api_flow.py`) passes for create-run and report retrieval path; backend suite now runs 3 tests total (all passing)
- Phase 8 Step 24 prep completed: added DigitalOcean droplet deployment checklist (`infra/do/droplet-deploy.md`) and PowerShell smoke check helper (`infra/scripts/smoke_check.ps1`), plus README testing/deployment runbook updates
- Phase 8 Step 24 runtime validation completed: `docker compose up -d --build` succeeded, containers healthy, database migrations applied, seed script executed in backend container, and `infra/scripts/smoke_check.ps1` passed all endpoint checks
- Verification run (2026-03-25): backend test suite re-run after live deployment validation (3 tests, all passing) and frontend build smoke still passing
- Verification run (2026-03-25): live container smoke suite (`infra/tests/test_live_containers.py`) executed successfully (3 tests passing: compose service states, backend/proxied health, frontend root serving)
- Auth hardening (2026-03-25): fixed nginx `/api` proxy path forwarding and switched password hashing to `pbkdf2_sha256`; defaults updated to `admin@salarysafe.dev` to satisfy strict email validation
- Phase 8 Step 23 expansion completed (2026-03-25): added API-level streaming endpoint test coverage for `GET /api/runs/{run_id}/stream` in `apps/backend/tests/test_api_flow.py` and validated backend suite (4 tests passing)
- Phase 8 Step 23 expansion completed (2026-03-25): added frontend smoke/navigation automation with Playwright (`apps/frontend/e2e/smoke-navigation.spec.ts`) and validated pass (`npm run test:smoke`)
- Phase 8 Step 24 evidence completed (2026-03-25): captured acceptance validation checklist and command outcomes in `docs/test-plan.md` (backend tests, frontend smoke, live container checks, auth verification)
- Verification run (2026-03-25): compose configuration validated after env mapping update (`docker compose config`)
- Verification run (2026-03-25): backend tests pass (4/4) and frontend Playwright smoke test passes (1/1)
- Repository hardening (2026-03-25): added root `.gitignore` to exclude `.env` and common generated artifacts from commits
- Verification run (2026-03-25): full stack rebuilt and validated with real `.env` (`docker compose up -d --build`, migrations, seed, smoke checks, backend tests 4/4, frontend smoke 1/1, auth login/me 200/200)
- UX enhancement (2026-03-25): surfaced job title/description/responsibilities in cases table and case editor, added case-scoped run history/inspection controls, and enriched run view with case header context, timestamps, active-step duration, and one-click rerun
- UX enhancement (2026-03-25): added Cases page creation workflows for both manual structured case creation and natural-language prompt -> structured case generation (`POST /api/cases/from-prompt`)
- UX enhancement (2026-03-25): natural-language case creation now supports preview/edit modal before save via `POST /api/cases/from-prompt/preview`, then explicit operator-confirmed case creation
- UX enhancement (2026-03-25): added live JSON validation indicators in generated draft modal and disabled case creation while JSON fields are invalid
- UX enhancement (2026-03-25): Cases page now uses tabbed ready-to-run manual intake (candidate+company+run-config), table header updated to `Case Title`, and added AI-powered `Random Generate Draft` button that auto-fills NL prompt input
- UX enhancement (2026-03-25): added dedicated Run Configs page with top-nav access (`/configs`) for manual run config viewing/creation, plus `Ready to Run`/`Setup Required` badge next to Launch Run in case editor
- UX enhancement (2026-03-25): added case-scoped deep link from case editor to run config management (`/configs?case_id=<id>`) and verified local runtime rebuilt/refreshed with latest UI changes

## Blocked / Dependencies
- `.copilot/copilot_instructions.md` is not present; using `.copilot/instructions.md` as the governing workspace instruction file
- Live LLM negotiation requires provider credentials to be set in `.env` (`OPENAI_API_KEY` for OpenAI, or Azure OpenAI endpoint/key/version/deployment values)
