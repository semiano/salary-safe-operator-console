# Patch 1.1 — Technical Implementation Plan

> **STATUS: ALL 10 ITEMS COMPLETE AND DEPLOYED** (2026-05-20)
> VPS: `159.65.237.234` — DB migrations at `0009_add_tenant_id` (head) — smoke checks pass.
> Known: `infra/scripts/smoke_check.ps1` has a hardcoded `localhost:8000` check that always fails when run locally; the two proxied checks both pass.

Each item below is self-contained. "Files touched" lists the minimum set. Items are ordered roughly by dependency.

---

## 1 · Move Alert Bell to Global Banner ✅ COMPLETE

**What:** The action-queue bell button currently lives inside each page's local header (`AllApplicationsPage.tsx` ~L307, `CorporateHomePage.tsx` ~L457). Move it to `App.tsx` in the global `<header>`, placed to the left of `MyAccountMenu`.

**How:**
- Extract the bell button + queue-count badge into a standalone `<ActionQueueBell />` component in `src/components/ActionQueueBell.tsx`.
- The component needs the `queueCount` value. Currently each page fetches its own queue count from `GET /api/cases/{case_id}/phase1-bids?needs_action=true` or similar. Centralise this as a lightweight `useQueueCount()` hook in `src/hooks/useQueueCount.ts` that polls on a short interval (e.g. 30 s) and returns `{ count }`.
- Render `<ActionQueueBell />` in `App.tsx` just before `<MyAccountMenu />` in the nav.
- Remove the local bell buttons from both pages.

**Files touched:**
- `src/App.tsx` — add bell component
- `src/components/ActionQueueBell.tsx` — new
- `src/hooks/useQueueCount.ts` — new
- `src/pages/AllApplicationsPage.tsx` — remove local bell
- `src/pages/CorporateHomePage.tsx` — remove local bell

---

## 2 · SaaS-Style Login / Account Menu ✅ COMPLETE

**What:** Replace the current minimal `MyAccountMenu` (username + Profile stub + Settings stub + Logout) with a richer dropdown that surfaces tenant context, user role, and useful account actions.

**Proposed UX (dropdown sections):**
```
┌─────────────────────────────────┐
│ 👤  Steve Admin                 │  ← display name from JWT `name` claim
│     admin@salarysafe.dev        │  ← email
│     Role: Global Admin          │  ← role badge (color-coded)
├─────────────────────────────────┤
│ Tenant                          │
│   Alias:  Acme Corp             │
│   ID:     ten_abc123            │  ← monospace, truncated, copy icon
├─────────────────────────────────┤
│ 📝 Profile                      │
│ ⚙️  Settings                    │
│ 🌙 Dark Mode          [toggle]  │  ← wired to item 4
│ 🎨 Style              [picker]  │  ← opens item 5 picker
├─────────────────────────────────┤
│ 🚪 Sign Out                     │
└─────────────────────────────────┘
```

**Limitations / scope:**
- Tenant alias and tenant ID are read-only in this patch; editing is Phase 2.
- Profile modal stub remains (full edit in Phase 2).
- Settings modal stub remains.
- Dark mode toggle and style picker wire to items 4 & 5.

**How:**
- JWT payload currently carries `name` + `role`; add `tenant_id` and `tenant_alias` claims once item 3 backend lands, but menu can render placeholders from `localStorage` in the interim.
- `getTokenName()` already exists in `src/auth/token.ts`. Add `getTokenClaim(claim: string)` helper.
- Rewrite `MyAccountMenu` in `App.tsx` (or extract to `src/components/AccountMenu.tsx`).

**Files touched:**
- `src/App.tsx` or new `src/components/AccountMenu.tsx`
- `src/auth/token.ts` — add `getTokenClaim()`

---

## 3 · SaaS Multi-Tenant Backend ✅ COMPLETE

**What:** Convert the data model so every resource is scoped to a `Tenant`. Supports future isolated-DB-per-tenant by routing through a tenant resolver.

**Recommended approach: shared DB + `tenant_id` FK (simpler, can migrate to isolated DBs later).**

### 3a — Data model changes
New `Tenant` table:
```sql
id          UUID  PK
alias       VARCHAR(80) UNIQUE  -- "Acme Corp"
slug        VARCHAR(40) UNIQUE  -- "acme-corp" (URL-safe)
plan        VARCHAR(40) DEFAULT 'free'
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ
```

Add `tenant_id UUID NOT NULL FK→tenants.id` to:
- `users`
- `job_listings` (if exists; currently surfaced via cases)
- `cases`
- `phase1_bids`
- `runs`
- `configs`
- all other data tables

### 3b — Auth
- Seed script creates a default `Tenant` (slug=`default`) and assigns all existing users to it.
- Login response embeds `tenant_id` + `tenant_alias` in the JWT.
- Middleware `get_current_tenant()` reads tenant from JWT; all service calls filter by `tenant_id`.

### 3c — Alembic migrations
- `0008_tenants_table.py` — create `tenants`
- `0009_add_tenant_id_to_all_tables.py` — add nullable `tenant_id`, backfill to default tenant, then set NOT NULL

### 3d — API
- `GET /api/tenants/me` — returns current tenant info (alias, id, plan)
- `PATCH /api/tenants/me` — update alias (admin only)

**Files touched:**
- `app/models/` — new `tenant.py`, modify `user.py`, `case.py`, `run.py`, etc.
- `app/alembic/versions/0008_*, 0009_*`
- `app/core/security.py` — `get_current_tenant()`
- `app/api/routes_auth.py` — embed tenant in JWT
- `app/api/routes_tenants.py` — new
- `app/services/` — all services filter by `tenant_id`
- `app/scripts/seed.py` — create default tenant

---

## 4 · Dark Mode Toggle ✅ COMPLETE

**What:** CSS dark mode switch persisted to `localStorage`.

**How:**
- Tailwind config already has `content` arrays; add `darkMode: 'class'` to `tailwind.config.ts`.
- On mount, `App.tsx` reads `localStorage.getItem('theme')` and sets `document.documentElement.classList.toggle('dark', value === 'dark')`.
- `useTheme()` hook in `src/hooks/useTheme.ts` — returns `{ theme, toggle }` and syncs to localStorage + DOM class.
- Dark variants for existing Tailwind utility classes will pick up automatically. Inline `style={{}}` blocks (there are many) need explicit dark variables — address on a per-screen basis in follow-up.
- Wire toggle in `AccountMenu` (item 2).

**Files touched:**
- `tailwind.config.ts` — `darkMode: 'class'`
- `src/App.tsx` — apply class on mount
- `src/hooks/useTheme.ts` — new
- `src/styles.css` — CSS variables for dark palette (background, text, border)

---

## 5 · Style Selector (Sales Demo Themes) ✅ COMPLETE

**What:** A preset-theme picker with 3–5 named palettes, shown in the account menu and/or as a floating chip. Theme is applied via a `data-theme="..."` attribute on `<html>` + CSS variable overrides.

**Proposed presets:**
| Key | Name | Vibe |
|---|---|---|
| `default` | SalarySafe Default | Current navy/slate/white |
| `midnight` | Midnight Pro | Dark navy, neon teal accents |
| `enterprise` | Enterprise Gray | Muted grays, blue CTAs |
| `warm` | Warm Oak | Warm cream, amber accents |
| `vivid` | Vivid Demo | High-contrast purple/yellow |

**How:**
- `src/hooks/useTheme.ts` (from item 4) extended: `{ theme, setTheme, style, setStyle }`.
- CSS variables per theme defined in `src/styles.css` under `[data-theme="midnight"] { --color-paper: ... }` etc.
- Picker rendered as a row of color-swatch buttons; accessible via `aria-label`.
- Persisted to `localStorage` as `salarysafe_style`.

**Files touched:**
- `src/styles.css`
- `src/hooks/useTheme.ts`
- `src/components/AccountMenu.tsx`
- `src/components/StylePicker.tsx` — new

---

## 6 · Benchmark Comparison — Unified Popout ✅ COMPLETE

**What:** The two standalone route-based pages (`/listings/:listingId/comp-internal`, `/listings/:listingId/comp-external`) and their separate nav buttons are replaced by a single **Compare Sources** popout panel accessible from the job-listing detail (PostRolePage).

**Popout UX:**
```
┌──────────────────────────────────────────────────┐
│  📊 Compensation Benchmark Compare        [✕]   │
├──────────────────────────────────────────────────┤
│  Source:  ○ Internal Bands  ● External Market    │
├──────────────────────────────────────────────────┤
│  [comparison data panel — source-specific]       │
├──────────────────────────────────────────────────┤
│  Automated Adjustment Suggestions                │
│  ┌──────────┬────────────────────┬──────────┐   │
│  │ Field    │ Current → Suggested │ Apply?   │   │
│  │ Min Sal  │ $80k → $87k         │ [✓]      │   │
│  │ Max Sal  │ $110k → $118k       │ [✓]      │   │
│  └──────────┴────────────────────┴──────────┘   │
│            [Cancel]  [Apply Selected]            │
└──────────────────────────────────────────────────┘
```

**How:**
- New `src/components/BenchmarkCompareModal.tsx` — modal/slide-over with source toggle, data panel, and adjustment rows.
- `PostRolePage.tsx`: replace the two separate buttons with a single "Compare Benchmarks" button that sets `showBenchmarkModal = true`.
- The adjustment apply flow calls `PATCH /api/job-listings/:id` with the adjusted min/max salary values (or whatever fields are relevant).
- `CompInternalPage.tsx` and `CompExternalPage.tsx` route stubs can remain for now (or be removed in a cleanup pass).

**Files touched:**
- `src/components/BenchmarkCompareModal.tsx` — new
- `src/pages/PostRolePage.tsx` — replace two buttons with one

---

## 7 · Auto-Trigger AI Match on Candidate Bid Submission ✅ COMPLETE

**What:** When a candidate submits their bid (endpoint `POST /apply/:token` → sets `submission_status = applicant_bid_submitted`), automatically kick off the AI match calculation so the bid doesn't sit as "Pending AI match review."

**Where the submission happens:**
- `routes_apply.py` → calls the service that flips `submission_status` to `applicant_bid_submitted`
- The bid's `ai_match_score` / `ai_match_summary` fields (or equivalent) need to be populated

**How:**
1. In `routes_apply.py` (or the service it calls), after the DB commit of the submitted bid, fire an async background task:
   ```python
   from fastapi import BackgroundTasks
   background_tasks.add_task(run_ai_match, bid_id=bid.id, db=db)
   ```
2. Implement `run_ai_match(bid_id, db)` in `app/services/phase1_bid_service.py` — calls the LLM provider to generate match score and reasoning, then updates bid in DB.
3. Add `ai_match_score: float | None` and `ai_match_summary: str | None` fields to `Phase1Bid` model if not present (needs migration `0010_bid_ai_match_fields.py`).
4. Route response schema already exposes `Phase1BidResponse` — add those two fields.

**Files touched:**
- `app/api/routes_apply.py`
- `app/services/phase1_bid_service.py` — `run_ai_match()` function
- `app/models/case.py` — add `ai_match_score`, `ai_match_summary`
- `alembic/versions/0010_bid_ai_match_fields.py`
- `app/schemas/phase1_bid.py` — expose new fields in response

---

## 8 · Fix Copy Button on Invitation Code (Admin Only) ✅ COMPLETE

**Problem:** The copy button in `BidDetailPage.tsx` (~L342) uses `navigator.clipboard.writeText()` which requires the page to be served over HTTPS or `localhost`. On the VPS at `http://159.65.237.234` (plain HTTP, non-localhost origin), the Clipboard API is unavailable and throws `NotAllowedError` / is undefined — silently fails.

**Fix:**
```tsx
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback: execCommand (deprecated but works on insecure origins)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}
```
Replace all `navigator.clipboard.writeText(...)` calls in the codebase with this util.

Put the helper in `src/utils/clipboard.ts`.

**Files touched:**
- `src/utils/clipboard.ts` — new
- `src/pages/BidDetailPage.tsx` — use helper
- `src/pages/PostRolePage.tsx` — use helper (also has a copy button)

---

## 9 · Real Mail Dispatching with Env-Override Intercept ✅ COMPLETE

**What:** Send real transactional emails (invite, response sent, etc.) via SMTP/SendGrid, but allow all outbound email to be redirected to a configured override address during dev/testing.

**Design:**
- New service: `app/services/mail_service.py`
  - Uses `smtplib` (stdlib) for plain SMTP or `sendgrid` SDK (conditional).
  - Reads env vars:
    ```
    MAIL_PROVIDER=smtp          # or sendgrid
    SMTP_HOST=
    SMTP_PORT=587
    SMTP_USER=
    SMTP_PASSWORD=
    MAIL_FROM=noreply@salarysafe.dev
    MAIL_OVERRIDE_ADDRESS=      # if set, ALL mail goes here instead
    MAIL_OVERRIDE_ENABLED=false
    ```
  - `send_email(to: str, subject: str, body_html: str)` — checks `MAIL_OVERRIDE_ADDRESS`; if set and `MAIL_OVERRIDE_ENABLED=true`, replaces `to` with override, prepends `[OVERRIDE → original@email.com]` to subject.

- Call sites: `routes_phase1_bids.py` (invitation send), `routes_phase1_bids.py` (response_sent action).

**Files touched:**
- `.env` — add `MAIL_*` vars
- `app/services/mail_service.py` — new
- `app/api/routes_phase1_bids.py` — call `mail_service.send_email()` at invite and response_sent points
- `requirements.txt` — add `sendgrid` (optional, only if provider=sendgrid)

---

## 10 · AI Auto-Respond Action (All Invitations — Global Admin Only) ✅ COMPLETE

**What:** In `AllApplicationsPage.tsx`, the Actions column for each invitation gets an orange "AI Auto-respond" button (visible only to `role === 'global_admin'`). Clicking it calls the backend which uses the existing AI simulation functions to fill in a realistic candidate bid response for that invitation.

**Backend:**
- New route: `POST /api/phase1-bids/{bid_id}/ai-auto-respond`
  - Auth: `global_admin` only (check `current_user.role`).
  - Calls `phase1_bid_service.create_simulated_submission()` (already exists at L371 of service) on the target bid, using the bid's case context as the LLM prompt seed.
  - Returns the updated `Phase1BidResponse`.

**Frontend:**
- In `AllApplicationsPage.tsx`, in the per-row actions area, add:
  ```tsx
  {isGlobalAdmin && bid.submission_status === "invitation_pending" && (
    <button
      style={{ background: "#f97316", color: "#fff", ... }}
      onClick={() => aiAutoRespond(bid.id)}
    >
      🤖 AI Auto-respond
    </button>
  )}
  ```
- Uses a `useMutation` that calls the new endpoint and invalidates the bids query on success.

**Files touched:**
- `app/api/routes_phase1_bids.py` — new route `/phase1-bids/{bid_id}/ai-auto-respond`
- `app/services/phase1_bid_service.py` — minor: expose a method suitable for single-bid auto-respond (likely `create_simulated_submission` already covers this)
- `src/pages/AllApplicationsPage.tsx` — add button and mutation

---

# Patch 1.2 — Compensation Benchmarking Integration Plan (Proposed)

> STATUS: PLANNED (2026-05-29)
> Objective: Replace current placeholder benchmark pages with production-ready Internal and External benchmarking workflows under one Compensation Benchmarking menu.

Execution update (2026-05-29):
- Completed: navigation and launcher consolidation
  - Global `Compensation Benchmarking` top-nav popover added.
  - Existing Workday benchmark UI converted to launcher/bridge behavior.
  - Listing context now flows from `PostRolePage` and `CorporatePortalPage` into benchmark launch links.
- Completed: first page implementation pass
  - `CompExternalPage` and `CompInternalPage` now render structured, context-aware benchmark workspaces using listing context when present.
  - Both pages expose cross-links and keep `Compare Benchmarks` helper as secondary support.
- Remaining (next execution slices):
  - wire real backend benchmark API contracts
  - replace helper/sample benchmark table data with live external/internal results
  - add backend synthesis/recommendation responses and suppression flags

This plan is based on investigation of:
- `C:\Users\Steve\Downloads\SS internal benchmarking`
- `C:\Users\Steve\Downloads\SS external benchmarking`
- existing SalarySafe frontend/backend routes and placeholder components.

## Summary Recommendation

Use a phased rollout with a hybrid backend strategy:
1. Keep FastAPI as system-of-record API surface for the app.
2. Run the provided external benchmark Node orchestrator as a sidecar service in Patch 1.2.
3. Add FastAPI proxy routes for auth, tenant scoping, and stable frontend contracts.
4. Replace placeholder pages with typed React pages that consume FastAPI endpoints.
5. Add a grouped menu entry: Compensation Benchmarking -> External / Internal.

This approach delivers value quickly while avoiding a risky full rewrite of the external provider stack.

---

## 1 · Navigation and IA: Compensation Benchmarking Menu

What:
- Add a grouped navigation item in the global header menu:
  - Compensation Benchmarking
  - External
  - Internal
- Preserve direct listing-scoped routes, but expose a top-level entry point that lands on a picker/overview page.

Why:
- Current routes already exist for listing-level external/internal pages, but discoverability is weak and there is no clear benchmark product area.

Planned route map:
- `/compensation-benchmarking` (new overview/picker)
- `/job-listings/:listingId/comp-external` (existing, replace placeholder UI)
- `/job-listings/:listingId/comp-internal` (existing, replace placeholder UI)

Files to modify:
- `apps/frontend/src/App.tsx`
- `apps/frontend/src/pages/CompExternalPage.tsx`
- `apps/frontend/src/pages/CompInternalPage.tsx`
- `apps/frontend/src/pages/CorporateHomePage.tsx` (optional listing-level deep links)

Acceptance:
- Menu exposes both pages under one benchmark grouping.
- Existing deep links keep working.

---

## 2 · Backend API Shape in FastAPI (Tenant-aware)

What:
- Introduce benchmark APIs in FastAPI and keep JWT/tenant enforcement there.
- Use a dedicated router: `/api/benchmarking/...`.

Endpoints (v1):
- `POST /api/benchmarking/external/search`
  - request: `{ role, location, level?, currency?, sources? }`
  - response: `{ ok, query, rows, sources, warnings }`
- `POST /api/benchmarking/external/search/bulk`
- `GET /api/benchmarking/external/providers`
- `POST /api/benchmarking/internal/upload-csv` (optional in phase 2 of this patch)
- `POST /api/benchmarking/internal/sync-hris` (HiBob stub-real switch)
- `GET /api/benchmarking/internal/summary?listing_id=...`

Files to add/modify:
- `apps/backend/app/api/routes_benchmarking.py` (new)
- `apps/backend/app/main.py` (include new router)
- `apps/backend/app/schemas/` (new benchmark request/response schemas)
- `apps/backend/app/services/` (benchmark service layer)

Acceptance:
- Frontend never calls sidecar directly; all traffic goes through FastAPI.
- All benchmark routes require auth and inherit tenant context.

---

## 3 · External Benchmark Service Integration (Sidecar)

What:
- Integrate the external benchmark Node service bundle as an infra sidecar container.
- FastAPI calls sidecar over internal network only.

Why this over immediate Python rewrite:
- The external package already has complete orchestrator structure and tests.
- Faster delivery with lower correctness risk.
- Keeps future option open to port logic to Python later.

Scope:
- Bring in modules from handover external docs:
  - `external-api.js`
  - `bls-client.js`
  - `nomis-client.js`
  - `talentup-client.js`
  - `taxonomy.js`, `transforms.js`, `cache.js`, `errors.js`, `http.js`, `logger.js`
- Keep current verification caveats explicit (Nomis dataset IDs and TalentUp schema).

Ops updates:
- Add sidecar service in `docker-compose.yml`
- Add env wiring and internal URL in backend settings
- Add health check endpoint dependency in smoke tests

Acceptance:
- External search works end-to-end through FastAPI proxy.
- Provider partial failures are returned as structured per-source statuses.

---

## 4 · Internal Benchmarking Data Flow (HiBob + CSV)

What:
- Implement internal benchmarking as a blended ingestion model:
  - CSV upload for immediate self-serve onboarding
  - HiBob connect/sync as system integration path

v1 storage recommendation:
- Persist normalised benchmark sample rows only (no employee PII fields).
- Keep raw HRIS payload out of persistent tables.

Data model (minimum):
- `benchmark_internal_samples`
  - `id, tenant_id, listing_id (nullable), role, level, location, salary, currency, source, imported_at`

Potential migration files:
- `apps/backend/alembic/versions/0011_benchmark_internal_samples.py`

Acceptance:
- Internal page can display by-role/by-level aggregates.
- Cohort-size suppression rules can be applied from stored aggregate inputs.

---

## 5 · Recommendation Engine and Results Synthesis

What:
- Implement recommendation synthesis in backend service (not only in UI).
- Keep formula aligned with handover logic:
  - `Te* = alpha*Mp + beta*I + gamma*f(J,X)`
  - start with `gamma = 0` in v1
  - enforce small-cohort suppression (`MIN_COHORT_SIZE = 5`)

Why backend-owned:
- Enables consistent behavior across pages and future reporting.
- Prevents formula drift in multiple frontend components.

Frontend page behavior:
- External page: provider cards + percentile overlays + warnings
- Internal page: ingestion state + aggregates + suppression indicators
- Shared recommendation card can appear in both pages for selected role/level

Acceptance:
- Deterministic recommendation output for same input.
- Clear reasoning text and suppression flags in API response.

---

## 6 · Frontend Implementation Plan

What:
- Replace placeholders with real data pages using typed API client methods.
- Add small reusable benchmark UI components.

Frontend additions:
- `apps/frontend/src/api/client.ts`
  - add `apiBenchmarkExternalSearch`, `apiBenchmarkProviders`, internal endpoints
- `apps/frontend/src/types/benchmarking.ts` (new)
- `apps/frontend/src/hooks/useBenchmarking.ts` (new)
- `apps/frontend/src/components/benchmarking/*` (new cards/charts/tables)
- update pages:
  - `apps/frontend/src/pages/CompExternalPage.tsx`
  - `apps/frontend/src/pages/CompInternalPage.tsx`

Design note:
- Keep visual style coherent with existing app shell.
- Avoid one-off prototype inline-style sprawl by preferring shared classes/tokens.

Acceptance:
- No hardcoded placeholder text remains on benchmark pages.
- Loading/error/empty states are explicit.

---

## 7 · Security, Privacy, and Compliance Guardrails

Mandatory guardrails for this patch:
- JWT + tenant scope on all benchmark APIs
- suppression label when internal cohort < 5
- no raw employee identifiers in API responses
- explicit currency-mixing warnings, no silent cross-currency compare
- feature flags for unverified upstream connectors (TalentUp/Nomis specifics)

Acceptance:
- Security review confirms no PII leakage through benchmark endpoints.

---

## 8 · Testing and Release Strategy

Backend tests:
- unit tests for synthesis math and suppression behavior
- router tests for `/api/benchmarking/*`
- integration tests for FastAPI proxy -> external sidecar

Frontend tests:
- route smoke tests for menu + both pages
- page-level tests for loading/error/result rendering

Release phases:
1. Phase A: Navigation + API scaffolding + placeholder replacement with mocked backend responses
2. Phase B: External sidecar live via FastAPI proxy
3. Phase C: Internal CSV + HiBob connect/sync + synthesis
4. Phase D: hardening, UX polish, and production rollout

Definition of done:
- Compensation Benchmarking menu is live with working External/Internal flows.
- Both pages are backed by authenticated APIs and tenant-safe data handling.
- Existing non-benchmark workflows remain unaffected.

---

## 9 · User Use Cases: What the New Benchmarking UI + Backend Enables

This section translates the technical scope into practical user outcomes.

### A. Navigation and discovery use cases

1. As a hiring operator, I can open one clear menu path (`Compensation Benchmarking`) and choose `External` or `Internal` without hunting through unrelated pages.
2. As a hiring operator, I can start from a global benchmarking entry point (`/compensation-benchmarking`) and then jump into a specific listing context.
3. As a hiring operator, I can deep-link teammates directly to listing-specific benchmark views (`/job-listings/:listingId/comp-external` and `/job-listings/:listingId/comp-internal`).

### B. External benchmarking use cases

4. As a hiring operator, I can search external market compensation by role + location and get percentile results (P10/P25/P50/P75/P90).
5. As a hiring operator, I can compare multiple provider outputs in one view and see where they agree/disagree.
6. As a hiring operator, I can understand provider-level reliability because each source reports success/failure state independently.
7. As a hiring operator, I can continue working even when one provider fails, instead of losing the entire benchmark response.
8. As a hiring operator, I can run bulk benchmark lookups for multiple role/location combinations in one operation.
9. As a hiring operator, I can see explicit warnings when result rows mix currencies, so I do not accidentally compare USD and GBP as if they were equivalent.
10. As a hiring operator, I can view a provider directory and understand which sources are enabled/available in the environment.

### C. Internal benchmarking use cases

11. As a hiring operator, I can upload internal compensation CSV data and immediately get role/level aggregate distributions.
12. As a hiring operator, I can sync internal benchmark data from HRIS (HiBob path) instead of manual upload.
13. As a hiring operator, I can inspect internal compensation trends for a target role and level tied to a listing.
14. As a hiring operator, I can refresh internal benchmark data and see updated aggregates without editing listing data manually.
15. As a hiring operator, I can operate with privacy guardrails that hide sensitive internal values when cohort size is too small.

### D. Recommendation and decision-support use cases

16. As a hiring operator, I can receive a blended recommendation based on external market (`Mp`) and internal signal (`I`) instead of relying on one source.
17. As a hiring operator, I can see the rationale text for how recommendation weights were chosen (for example, reduced internal weight at small cohort size).
18. As a hiring operator, I can view a confidence range around recommendations and use it to set realistic negotiation bounds.
19. As a hiring operator, I can evaluate recommendation inputs by role/level before deciding whether to adjust listing salary floors/ceilings.
20. As a hiring operator, I can use benchmarking outputs as evidence during compensation approval discussions.

### E. Listing workflow use cases

21. As a hiring operator creating or editing a job listing, I can open benchmarking context and validate whether proposed salary ranges are market-aligned.
22. As a hiring operator, I can compare current listing range vs suggested benchmark range and decide if a range adjustment is needed.
23. As a hiring operator, I can update listing compensation inputs with more confidence because I have both internal and external evidence.
24. As a hiring operator, I can revisit benchmark views later and verify whether the listing still aligns with current market snapshots.

### F. Multi-tenant and security use cases

25. As an authenticated user, I can access only my tenant's internal benchmark data; other tenants' data is never visible.
26. As a platform admin, I can trust that benchmark API requests are authorized through the existing JWT flow and tenant context.
27. As a compliance stakeholder, I can confirm that employee-level PII is not exposed in benchmark API responses used by the UI.
28. As a compliance stakeholder, I can confirm cohort suppression and warning signals are applied consistently by backend logic rather than ad hoc UI logic.

### G. Reliability and operations use cases

29. As a product/operator team member, I can monitor benchmark service health and provider availability through structured API responses and logs.
30. As an engineer, I can deploy benchmark capabilities incrementally (mocked -> sidecar live -> full internal sync) without breaking existing app routes.
31. As an engineer, I can troubleshoot external provider issues faster because source-level errors are preserved and not flattened into one generic failure.

### H. Executive/business value use cases

32. As a hiring lead, I can justify compensation bands with transparent external and internal evidence.
33. As a hiring lead, I can reduce under-market offers that hurt acceptance rate by grounding offers in percentile-based market benchmarks.
34. As a hiring lead, I can reduce over-budget offers by balancing market pressure with internal pay structures.
35. As a leadership stakeholder, I can standardize compensation decisioning across roles using a common benchmarking workflow.

### I. Out-of-scope clarifier use cases (not enabled in Patch 1.2)

36. Users cannot yet run demographic bias analysis from benchmarking (deferred).
37. Users cannot yet rely on fully verified global TalentUp behavior in all markets until provider contract/schema validation is completed.
38. Users cannot yet treat benchmarking as a full compensation planning suite (equity/bonus total-comp decomposition is still future scope).

---

## 10 · Consolidation of Existing Workday Benchmark Surfaces

What exists today:
- `WorkdayBenchmarkPanel` is a local two-button launcher inside the listing editor and corporate portal.
- `BenchmarkCompareModal` is a sample-data compare sheet launched from the listing editor.
- Both are disconnected from the new benchmark pages and therefore duplicate intent.

Consolidation rule:
- Keep the current Workday surfaces only as bridge/launcher UI.
- Route all real benchmark workflows into the new `CompExternalPage` and `CompInternalPage` pages.
- Use popover linking for quick access, not as a second benchmark implementation.

How the old surfaces map forward:
- `Benchmark Listing External (Workday)` → opens the External benchmark page.
- `Benchmark Listing Internal (Workday)` → opens the Internal benchmark page.
- `Compare Benchmarks` → remains a helper/bridge action, but should not become the primary benchmark workspace.
- The new top-level `Compensation Benchmarking` menu becomes the main discovery point.

Implementation notes:
- Add a top-nav `Compensation Benchmarking` popover with overview/external/internal links.
- Turn `WorkdayBenchmarkPanel` into a compact benchmark launcher with the same destinations.
- Pass the current listing context into the launcher when available so links can preserve the listing scope.
- Leave `BenchmarkCompareModal` only as a secondary comparison aid until it can be replaced by a real compare page.


- `src/api/` — add API call helper

---

## Execution Order (suggested)

| Priority | Item | Reason |
|---|---|---|
| 1 | 8 — Copy button fix | Quick win, broken prod feature |
| 2 | 7 — Auto AI match | Core workflow correctness |
| 3 | 10 — AI Auto-respond | Builds on #7 service |
| 4 | 1 — Bell in banner | UI polish, isolated change |
| 5 | 9 — Real mail | Needed for production readiness |
| 6 | 2 — Account menu | Depends on partial 3 (tenant info) |
| 7 | 3 — SaaS multi-tenant | Largest scope, DB migrations |
| 8 | 4 — Dark mode | Isolated, low risk |
| 9 | 5 — Style selector | Depends on 4 |
| 10 | 6 — Benchmark popout | Self-contained UI refactor |
