Below is a PoC implementation spec you can hand to GitHub Copilot and build from directly.

I’m assuming:

* **React frontend**
* **FastAPI backend**
* **Postgres**
* **Docker for every service**
* **DigitalOcean** hosting
* **Azure OpenAI or OpenAI API** as the model backend
* **No human review gate** in the PoC
* **Microsoft Agent Framework** as the multi-agent orchestration layer

Microsoft Agent Framework now supports Python and multi-agent orchestration patterns including sequential, concurrent, group chat, and manager-style orchestration, which fits this design well. ([Microsoft Learn][1])

---

# 1. PoC goal

Build a working internal web app where an admin/test user can:

1. create a negotiation case
2. enter candidate-side and company-side inputs
3. choose config options for the run
4. execute a multi-agent negotiation
5. watch the conversation unfold in a chat-like UI
6. inspect full internal agent visibility in admin mode
7. review the final structured JSON report
8. re-run the case multiple times and compare outputs

This is not final UX. It is an **operator/testing console** optimized for:

* transparency
* troubleshooting
* prompt iteration
* schema validation
* orchestration debugging

---

# 2. Recommended PoC architecture

## Services

### Frontend

* **React + TypeScript + Vite**
* primary UI modes:

  * Case Setup
  * Live Negotiation Chat View
  * Admin Trace View
  * Final Report View
  * Run Comparison View

### Backend API

* **FastAPI**
* responsibilities:

  * authentication for admin/test access
  * CRUD for negotiation cases
  * orchestration trigger
  * streaming run events to UI
  * database persistence
  * final report generation
  * agent config and prompt management

### Agent Worker

* Python service using **Microsoft Agent Framework**
* responsibilities:

  * instantiate agents
  * run guided workflow
  * run bounded group chat
  * collect turn logs
  * produce round summaries
  * emit final JSON result

### Database

* **Postgres**
* responsibilities:

  * cases
  * runs
  * messages
  * configs
  * prompts
  * outputs
  * audit/debug traces

### Optional Redis for PoC

Not strictly required, but useful for:

* run state
* lightweight pub/sub
* websocket fanout
* retry handling

For a PoC, you can skip Redis initially and stream directly from FastAPI if you keep run volume low.

---

# 3. High-level system design

## Orchestration pattern

Use a **hybrid guided workflow**:

1. intake normalization
2. candidate prep
3. company prep
4. policy/compliance check
5. bounded group negotiation
6. arbitrator synthesis
7. final JSON output

That design is the most stable for PoC testing. Agent Framework explicitly supports workflow orchestration plus group chat coordination, which is exactly what we want here. ([Microsoft Learn][2])

## Recommended agent set for PoC

Use **5 agents**:

1. **IntakeNormalizerAgent**
2. **CandidateRepAgent**
3. **CompanyRepAgent**
4. **PolicyGuardAgent**
5. **ArbitratorAgent**

For PoC, keep final JSON generation inside the ArbitratorAgent instead of adding a sixth compiler agent.

---

# 4. Repo structure

```text
salary-negotiation-poc/
  apps/
    frontend/
      src/
        components/
        pages/
        hooks/
        api/
        types/
        state/
      Dockerfile
      package.json
      vite.config.ts

    backend/
      app/
        main.py
        api/
          routes_auth.py
          routes_cases.py
          routes_runs.py
          routes_prompts.py
          routes_configs.py
          routes_admin.py
          routes_ws.py
        core/
          settings.py
          security.py
          db.py
          logging.py
        models/
          case.py
          run.py
          message.py
          prompt.py
          config.py
        schemas/
          case.py
          run.py
          message.py
          prompt.py
          report.py
        services/
          case_service.py
          run_service.py
          event_stream_service.py
          prompt_service.py
          config_service.py
        workers/
          negotiation_runner.py
        agent_runtime/
          agent_factory.py
          orchestration.py
          prompts/
            candidate_rep.txt
            company_rep.txt
            arbitrator.txt
            intake_normalizer.txt
            policy_guard.txt
          tools/
            negotiation_state_tools.py
            policy_tools.py
            scoring_tools.py
            report_tools.py
      Dockerfile
      requirements.txt

  infra/
    docker-compose.yml
    nginx/
      default.conf
    postgres/
      init.sql
    do/
      app-platform-notes.md
      droplet-deploy.md

  docs/
    implementation-spec.md
    api-contract.md
    prompt-design.md
    test-plan.md

  .env.example
  README.md
```

---

# 5. Technology choices

## Frontend

* React
* TypeScript
* Vite
* Zustand or Redux Toolkit for state
* React Query for API state
* Tailwind for fast PoC styling
* native WebSocket or SSE client for live updates

## Backend

* FastAPI
* SQLAlchemy
* Alembic
* Pydantic
* asyncpg or psycopg
* WebSockets or Server-Sent Events
* Uvicorn/Gunicorn

## AI / orchestration

* Microsoft Agent Framework for multi-agent workflows and group chat orchestration ([Microsoft Learn][1])
* Model abstraction:

  * OpenAI API
  * Azure OpenAI
* Small wrapper so the rest of the app does not care which provider is active

## Hosting

* Docker Compose on a DigitalOcean droplet for simplest PoC
* Nginx reverse proxy
* Postgres container
* optional managed Postgres later

---

# 6. Functional requirements

## 6.1 Case management

Admin/test user can:

* create a case
* edit case metadata
* save candidate public/private inputs
* save company public/private inputs
* select negotiation mode
* select number of runs
* select prompt set version
* launch negotiation
* duplicate prior case

## 6.2 Live run view

System shows:

* run status
* current phase
* current round
* agent speaking
* public turn content
* internal reasoning summary fields that are safe to expose in admin mode
* policy flags
* structured package proposals
* final output JSON

## 6.3 Admin visibility mode

Admin can see:

* hidden/internal fields
* normalized intake objects
* policy findings
* per-agent prompt version
* per-turn token usage if available
* raw tool outputs
* final parsed JSON
* orchestration checkpoints

## 6.4 Rerun / compare

Admin can:

* run N simulations
* compare final package outputs
* compare convergence patterns
* compare confidence scores
* compute median and range

---

# 7. User roles

## Admin

Full visibility:

* all case data
* all confidential inputs
* all prompts
* all traces
* final JSON
* run comparison

## Test User

Can create and run cases, but may have restricted visibility depending on config.

For the PoC, it is acceptable to start with a single **admin** role only.

---

# 8. Data model

## 8.1 Core tables

### users

```sql
id UUID PK
email TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
role TEXT NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

### negotiation_cases

```sql
id UUID PK
title TEXT NOT NULL
description TEXT NULL
created_by UUID FK users(id)
status TEXT NOT NULL
jurisdiction TEXT NULL
currency TEXT NOT NULL DEFAULT 'USD'
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### case_parties

```sql
id UUID PK
case_id UUID FK negotiation_cases(id)
party_type TEXT NOT NULL -- candidate | company
public_payload JSONB NOT NULL
confidential_payload JSONB NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### prompt_sets

```sql
id UUID PK
name TEXT NOT NULL
version TEXT NOT NULL
description TEXT NULL
candidate_rep_prompt TEXT NOT NULL
company_rep_prompt TEXT NOT NULL
arbitrator_prompt TEXT NOT NULL
intake_prompt TEXT NOT NULL
policy_prompt TEXT NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

### run_configs

```sql
id UUID PK
case_id UUID FK negotiation_cases(id)
name TEXT NOT NULL
config_json JSONB NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

### negotiation_runs

```sql
id UUID PK
case_id UUID FK negotiation_cases(id)
run_config_id UUID FK run_configs(id)
prompt_set_id UUID FK prompt_sets(id)
status TEXT NOT NULL
started_at TIMESTAMPTZ NULL
completed_at TIMESTAMPTZ NULL
provider TEXT NOT NULL -- openai | azure_openai
model_name TEXT NOT NULL
orchestration_mode TEXT NOT NULL
summary_json JSONB NULL
final_report_json JSONB NULL
error_text TEXT NULL
created_at TIMESTAMPTZ NOT NULL
```

### run_messages

```sql
id UUID PK
run_id UUID FK negotiation_runs(id)
phase TEXT NOT NULL
round_number INT NOT NULL
speaker_agent TEXT NOT NULL
visibility TEXT NOT NULL -- public | admin_only | system
message_type TEXT NOT NULL -- turn | proposal | policy_flag | summary | status
content TEXT NOT NULL
structured_payload JSONB NULL
created_at TIMESTAMPTZ NOT NULL
```

### run_artifacts

```sql
id UUID PK
run_id UUID FK negotiation_runs(id)
artifact_type TEXT NOT NULL -- normalized_intake | policy_report | final_json | metrics
payload JSONB NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

### run_metrics

```sql
id UUID PK
run_id UUID FK negotiation_runs(id)
metric_name TEXT NOT NULL
metric_value NUMERIC NULL
metric_json JSONB NULL
created_at TIMESTAMPTZ NOT NULL
```

---

# 9. Core payload schemas

## 9.1 Candidate input payload

```json
{
  "candidate_profile": {
    "name": "optional for poc",
    "years_experience": 10,
    "current_title": "Senior Engineer",
    "target_title": "Staff Engineer",
    "location": "New Jersey, USA"
  },
  "candidate_public_inputs": {
    "strengths": ["leadership", "domain expertise"],
    "value_narrative": "Led major migration and delivered measurable results.",
    "desired_compensation": {
      "base_salary_target": 210000,
      "bonus_target_pct": 15,
      "equity_target": 50000,
      "sign_on_target": 20000
    }
  },
  "candidate_confidential_inputs": {
    "walkaway_base_salary": 185000,
    "competing_offer": {
      "exists": true,
      "base_salary": 198000
    },
    "priority_weights": {
      "base_salary": 0.35,
      "bonus": 0.1,
      "equity": 0.2,
      "sign_on": 0.1,
      "title": 0.1,
      "flexibility": 0.15
    },
    "must_not_disclose": [
      "walkaway_base_salary",
      "family_constraints",
      "true_competing_offer_company"
    ]
  }
}
```

## 9.2 Company input payload

```json
{
  "company_profile": {
    "company_name": "ExampleCo",
    "role_title": "Staff Engineer",
    "level": "L6",
    "location": "Remote-US"
  },
  "company_public_inputs": {
    "role_scope": "Lead platform efforts across two teams.",
    "budget_context": "Competitive but structured by level."
  },
  "company_confidential_inputs": {
    "budget_floor": 175000,
    "budget_target": 190000,
    "budget_ceiling": 205000,
    "internal_equity_notes": "Must stay aligned with adjacent L6 hires.",
    "approval_thresholds": {
      "above_200k_requires": "VP approval"
    },
    "must_not_disclose": [
      "exact_peer_compensation",
      "hidden_budget_ceiling_rationale"
    ]
  }
}
```

---

# 10. Run config schema

```json
{
  "provider": "azure_openai",
  "model_name": "gpt-4.1",
  "temperature_profile": {
    "intake": 0.1,
    "candidate_rep": 0.4,
    "company_rep": 0.3,
    "policy_guard": 0.0,
    "arbitrator": 0.1
  },
  "conversation_mode": "hybrid_guided_groupchat",
  "max_rounds": 5,
  "max_turns_per_round": 3,
  "enable_policy_guard": true,
  "enable_admin_trace": true,
  "require_structured_proposals": true,
  "allow_title_tradeoffs": true,
  "allow_equity_tradeoffs": true,
  "allow_review_cycle_tradeoffs": true,
  "deadlock_repeat_threshold": 2,
  "rerun_count": 3
}
```

---

# 11. Agent specs

## 11.1 IntakeNormalizerAgent

### Purpose

Transform messy case input into structured objects.

### Inputs

* candidate public/confidential payload
* company public/confidential payload
* run config

### Outputs

```json
{
  "normalized_candidate": {},
  "normalized_company": {},
  "missing_information": [],
  "public_facts": [],
  "confidential_facts": [],
  "inferred_facts": [],
  "risk_flags": []
}
```

### Prompt file

`agent_runtime/prompts/intake_normalizer.txt`

Core instruction:

* extract facts
* classify public vs confidential
* normalize compensation fields
* identify missing inputs
* do not negotiate

---

## 11.2 CandidateRepAgent

### Purpose

Advocate for candidate package quality.

### Inputs

* normalized candidate data
* shared public facts
* company public facts
* prior round state

### Outputs per turn

```json
{
  "turn_goal": "advance_base_or_package",
  "public_message": "structured conversational turn",
  "proposal": {
    "base_salary": 205000,
    "bonus_pct": 15,
    "equity": 40000,
    "sign_on": 15000,
    "title": "Staff Engineer",
    "other_terms": ["6-month compensation review"]
  },
  "rationale": [
    "scope justifies upper-band placement",
    "competing market demand"
  ],
  "concession_offered": "reduced sign-on ask if base is improved",
  "confidence": 0.76
}
```

---

## 11.3 CompanyRepAgent

### Purpose

Represent budget, equity, and approval constraints.

### Inputs

* normalized company data
* shared public facts
* candidate public facts
* prior round state

### Outputs per turn

Same schema shape as candidate, but company-facing.

---

## 11.4 PolicyGuardAgent

### Purpose

Check every major phase and proposal for prohibited logic or leakage.

### Inputs

* normalized input
* candidate turn
* company turn
* proposal bundle

### Outputs

```json
{
  "status": "pass_with_flags",
  "issues": [
    {
      "severity": "medium",
      "type": "confidentiality_risk",
      "message": "Company response references internal peer compensation too specifically.",
      "remediation": "Generalize to internal equity policy wording."
    }
  ]
}
```

---

## 11.5 ArbitratorAgent

### Purpose

Control negotiation flow and produce final JSON.

### Inputs

* all normalized artifacts
* all turn history
* policy findings
* run config

### Outputs

* round summaries
* settlement zone assessments
* final structured JSON

---

# 12. Orchestration design

## 12.1 Flow

### Phase A: Intake

1. Load case
2. Normalize both sides
3. Persist normalized artifact
4. Emit admin trace

### Phase B: Preparation

1. CandidateRep generates opening position
2. CompanyRep generates opening position
3. PolicyGuard checks both

### Phase C: Bounded group negotiation

For each round:

1. Arbitrator posts round objective
2. CandidateRep responds
3. CompanyRep responds
4. PolicyGuard validates
5. Arbitrator summarizes gap and either:

   * continues
   * proposes closing package
   * declares deadlock

### Phase D: Final synthesis

1. Arbitrator creates final JSON report
2. Backend validates against Pydantic schema
3. Persist report
4. Emit final event

## 12.2 Why not pure freeform

Pure freeform will be harder to:

* debug
* compare across runs
* ensure schema stability
* prevent repetitive loops

So PoC should use guided phases with chat-like rendering.

---

# 13. Backend implementation details

## 13.1 Main API routes

### Cases

* `POST /api/cases`
* `GET /api/cases`
* `GET /api/cases/{case_id}`
* `PUT /api/cases/{case_id}`
* `POST /api/cases/{case_id}/duplicate`

### Run configs

* `POST /api/cases/{case_id}/configs`
* `GET /api/cases/{case_id}/configs`

### Prompt sets

* `POST /api/prompts`
* `GET /api/prompts`
* `GET /api/prompts/{prompt_set_id}`
* `PUT /api/prompts/{prompt_set_id}`

### Runs

* `POST /api/cases/{case_id}/runs`
* `GET /api/runs/{run_id}`
* `GET /api/runs/{run_id}/messages`
* `GET /api/runs/{run_id}/report`
* `GET /api/runs/{run_id}/artifacts`
* `POST /api/runs/{run_id}/rerun`

### Streaming

* `GET /api/runs/{run_id}/stream` using SSE
  or
* `WS /ws/runs/{run_id}`

For PoC, SSE is simpler if you do not need bi-directional input during a run.

---

# 14. FastAPI service design

## 14.1 `run_service.py`

Responsibilities:

* create run row
* enqueue/launch worker
* mark run status
* store events/messages

## 14.2 `negotiation_runner.py`

Responsibilities:

* instantiate model client
* load prompt set
* build agents
* execute orchestration
* persist events

## 14.3 `agent_factory.py`

Responsibilities:

* construct each agent with:

  * name
  * system prompt
  * config
  * model binding
  * tools
  * output schema

## 14.4 `orchestration.py`

Responsibilities:

* implement workflow phases
* group chat round loop
* deadlock rules
* final synthesis
* event emission

---

# 15. Microsoft Agent Framework implementation approach

Use Agent Framework for:

* agent object creation
* workflow orchestration
* group chat orchestration
* manager-directed turn selection

Agent Framework docs show:

* workflow orchestration patterns
* group chat with orchestrator-selected speakers
* builder patterns for Python, including `GroupChatBuilder` ([Microsoft Learn][3])

## Practical PoC pattern

* Use normal Python orchestration for outer phases
* Use Agent Framework group chat only for the negotiation rounds
* Let Arbitrator act as the manager/orchestrator for that inner chat

That keeps the architecture understandable and easier for Copilot to scaffold.

---

# 16. Example backend pseudocode

```python
async def run_negotiation(case_id: str, run_id: str):
    case = await case_service.load_case(case_id)
    config = await config_service.load_run_config(case.run_config_id)
    prompts = await prompt_service.load_prompt_set(case.prompt_set_id)

    emit_status(run_id, "starting")

    normalized = await run_intake_normalization(case, prompts, config)
    await artifact_repo.save(run_id, "normalized_intake", normalized)

    candidate_agent = build_candidate_agent(prompts, config, normalized)
    company_agent = build_company_agent(prompts, config, normalized)
    policy_agent = build_policy_agent(prompts, config, normalized)
    arbitrator_agent = build_arbitrator_agent(prompts, config, normalized)

    opening_candidate = await candidate_agent.opening_statement()
    opening_company = await company_agent.opening_statement()

    await save_turn(run_id, opening_candidate)
    await save_turn(run_id, opening_company)

    policy_result = await policy_agent.review_openings(opening_candidate, opening_company)
    await save_artifact(run_id, "policy_opening_review", policy_result)

    if policy_result["status"] == "fail":
        raise NegotiationBlockedError(policy_result)

    round_state = init_round_state(opening_candidate, opening_company, normalized, config)

    for round_number in range(1, config.max_rounds + 1):
        arbitrator_instruction = await arbitrator_agent.create_round_instruction(round_state)
        await save_turn(run_id, arbitrator_instruction)

        candidate_turn = await candidate_agent.respond(round_state, arbitrator_instruction)
        await save_turn(run_id, candidate_turn)

        company_turn = await company_agent.respond(round_state, arbitrator_instruction, candidate_turn)
        await save_turn(run_id, company_turn)

        policy_round = await policy_agent.review_round(candidate_turn, company_turn)
        await save_artifact(run_id, f"policy_round_{round_number}", policy_round)

        round_state = await arbitrator_agent.update_round_state(
            round_state, candidate_turn, company_turn, policy_round
        )

        await save_artifact(run_id, f"round_state_{round_number}", round_state)

        if round_state["status"] in ["agreement", "deadlock", "near_agreement"]:
            break

    final_report = await arbitrator_agent.generate_final_report(round_state)
    validate_final_report(final_report)
    await save_final_report(run_id, final_report)

    emit_status(run_id, "completed")
```

---

# 17. Frontend implementation spec

## 17.1 Main pages

### `/cases`

Table of cases:

* title
* status
* last updated
* last run
* actions

### `/cases/:caseId`

Case editor:

* candidate public input form
* candidate confidential input form
* company public input form
* company confidential input form
* prompt set selector
* config editor
* run button

### `/runs/:runId`

Split-screen PoC operator view:

#### Left pane

Chat visualization

* system messages
* candidate turns
* company turns
* arbitrator turns
* policy warnings

#### Right pane

Tabbed debug panel

* Run Status
* Normalized Intake
* Active Config
* Policy Findings
* Structured Proposals
* Final JSON
* Raw Events

### `/runs/:runId/report`

Pretty render of final JSON:

* outcome summary
* package recommendation
* alternative packages
* risks
* confidence
* raw JSON accordion

### `/runs/:runId/compare`

For N reruns:

* outcome cards
* salary range chart
* confidence comparison
* median recommendation
* JSON diff summary

---

# 18. Frontend component list

* `CaseForm`
* `PartyInputPanel`
* `RunConfigEditor`
* `PromptSetSelector`
* `LiveRunHeader`
* `ChatTranscript`
* `ChatMessageBubble`
* `RoundMarker`
* `PolicyFlagCard`
* `ProposalCard`
* `ArtifactViewer`
* `JsonViewer`
* `RunComparisonGrid`
* `MetricSummaryCards`

---

# 19. Chat visualization behavior

This is important because your UI is chat-first.

## Public chat mode

Show only:

* arbitrator prompts
* candidate public turns
* company public turns
* public package summaries

## Admin mode

Additionally show:

* normalized objects
* hidden rationale summaries
* policy review results
* internal run state
* prompt versions
* token or model metadata if available

Each message should carry badges:

* speaker
* phase
* round
* visibility
* message type

Example:

* `Arbitrator | Round 2 | public`
* `PolicyGuard | Round 2 | admin_only`
* `CandidateRep | proposal | public`

---

# 20. Final JSON schema

Use the structure below as the authoritative PoC output contract.

```json
{
  "schema_version": "1.0",
  "negotiation_id": "uuid",
  "run_id": "uuid",
  "status": "agreement | near_agreement | deadlock | insufficient_information",
  "summary": {
    "public_summary": "string",
    "executive_summary": "string"
  },
  "recommended_package": {
    "base_salary": 0,
    "bonus_pct": 0,
    "equity_value": 0,
    "sign_on_bonus": 0,
    "title": "string",
    "review_timeline_months": 0,
    "flexibility_terms": [],
    "other_terms": []
  },
  "recommended_range": {
    "base_salary_min": 0,
    "base_salary_max": 0,
    "total_package_min": 0,
    "total_package_max": 0,
    "currency": "USD"
  },
  "alternative_packages": [
    {
      "label": "Option A",
      "package": {},
      "fit_for_candidate": "low | medium | high",
      "fit_for_company": "low | medium | high",
      "rationale": "string"
    }
  ],
  "candidate_arguments": [],
  "company_arguments": [],
  "decisive_factors": [],
  "unsupported_claims": [],
  "policy_flags": [],
  "confidence": {
    "overall_confidence": 0.0,
    "data_completeness_score": 0.0,
    "market_alignment_score": 0.0,
    "internal_equity_confidence": 0.0,
    "notes": "string"
  },
  "run_metrics": {
    "rounds_completed": 0,
    "deadlock_risk_final": "low | medium | high",
    "candidate_concession_count": 0,
    "company_concession_count": 0
  },
  "next_actions": {
    "candidate": [],
    "company": [],
    "system": []
  },
  "admin_only": {
    "candidate_private_assessment": {},
    "company_private_assessment": {},
    "arbitrator_private_notes": []
  }
}
```

Backend must validate this with Pydantic before saving.

---

# 21. Configurable prompt strategy

Store prompts in Postgres so admin can edit them in the PoC UI.

## Prompt set fields

* name
* version
* description
* intake normalizer prompt
* candidate rep prompt
* company rep prompt
* policy guard prompt
* arbitrator prompt

## Prompt versioning rule

Every run stores:

* prompt set id
* prompt version
* model name
* provider

That way you can compare runs reliably.

---

# 22. Model provider abstraction

## Interface

```python
class LLMProvider(Protocol):
    async def generate(self, system_prompt: str, messages: list[dict], **kwargs) -> dict:
        ...
```

## Implementations

* `OpenAIProvider`
* `AzureOpenAIProvider`

Run config chooses provider.

This is important because the PoC should not care if the backend uses OpenAI API or Azure OpenAI.

---

# 23. Suggested environment variables

```bash
APP_ENV=local
APP_HOST=0.0.0.0
APP_PORT=8000
FRONTEND_URL=http://localhost:5173

POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=salary_negotiation
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

JWT_SECRET=change_me
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

LLM_PROVIDER=azure_openai

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1

AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_VERSION=
AZURE_OPENAI_DEPLOYMENT_NAME=

DEFAULT_PROMPT_SET_VERSION=1.0
DEFAULT_CURRENCY=USD
DEFAULT_JURISDICTION=US
LOG_LEVEL=INFO
```

---

# 24. Docker setup

## 24.1 `docker-compose.yml`

Services:

* frontend
* backend
* postgres
* nginx

Example shape:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: salary_negotiation
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./apps/backend
    env_file:
      - .env
    depends_on:
      - postgres
    ports:
      - "8000:8000"

  frontend:
    build: ./apps/frontend
    depends_on:
      - backend
    ports:
      - "5173:5173"

  nginx:
    image: nginx:latest
    volumes:
      - ./infra/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - frontend
      - backend
    ports:
      - "80:80"

volumes:
  postgres_data:
```

## 24.2 Backend Dockerfile

* Python 3.12 slim
* install requirements
* run alembic migrations
* launch uvicorn

## 24.3 Frontend Dockerfile

* node build stage
* nginx static serve or Vite preview for dev
* for PoC, static build behind nginx is cleaner

---

# 25. DigitalOcean deployment plan

## Simplest PoC deployment

Use one **Dockerized droplet**:

* Ubuntu
* Docker + Docker Compose
* Nginx reverse proxy
* local Postgres container

### Pros

* cheapest
* simplest
* fastest to stand up

### Cons

* not production-grade
* weaker scaling
* app and DB on same box

That is fine for a PoC.

## Better later

* App Platform or Kubernetes
* Managed Postgres
* Spaces for artifact storage
* Redis
* centralized logs

---

# 26. Security for PoC

Keep this practical, not overbuilt.

## Must-have

* admin login
* hashed passwords
* JWT auth
* CORS config
* environment secrets, not hardcoded
* confidential data never returned in non-admin API responses
* separate visibility flags on stored messages

## Good enough for PoC

* no SSO yet
* no RBAC complexity beyond admin/test
* no field-level encryption unless required

If you want one extra safety layer, encrypt `confidential_payload` columns at the app layer before writing to Postgres.

---

# 27. Testing plan

## Unit tests

* prompt loading
* config validation
* final JSON validation
* deadlock detection
* message visibility filtering
* provider selection

## Integration tests

* create case
* create run
* run full orchestration
* persist messages
* retrieve final report

## UI tests

* create case flow
* run launch flow
* chat updates visible
* final report renders
* admin debug tabs render

## Golden test cases

Create 5 canonical scenarios:

1. easy agreement
2. moderate gap with package tradeoff
3. deadlock on base salary
4. missing data / insufficient information
5. policy-flagged scenario

---

# 28. Recommended development phases

## Phase 1

* FastAPI scaffold
* React scaffold
* Postgres schema
* auth
* case CRUD

## Phase 2

* prompt set CRUD
* run config CRUD
* provider abstraction
* static agent prompts in files

## Phase 3

* Microsoft Agent Framework integration
* intake normalization
* candidate/company opening statements
* live run storage

## Phase 4

* bounded round negotiation
* policy guard
* arbitrator final JSON
* report validation

## Phase 5

* live SSE stream
* chat visualization
* admin trace view
* rerun comparison

## Phase 6

* dockerize
* deploy to DigitalOcean
* seed sample prompt sets and cases

---

# 29. GitHub Copilot build instructions

Use these as the governing build rules for Copilot.

## Copilot master implementation brief

```text
Build a PoC multi-agent salary negotiation system with:
- React + TypeScript + Vite frontend
- FastAPI backend
- Postgres database
- Docker containers for all services
- DigitalOcean-compatible deployment using docker-compose
- Microsoft Agent Framework for multi-agent orchestration
- OpenAI API or Azure OpenAI selectable via config

The system must support:
1. negotiation case creation
2. candidate/company public and confidential inputs
3. prompt set versioning
4. run config versioning
5. live run execution
6. chat-style visualization of negotiation
7. admin-only full visibility and debug traces
8. final JSON report generation and validation
9. rerun comparison

Implement a guided workflow:
- intake normalization
- opening statements
- policy review
- bounded negotiation rounds
- arbitrator synthesis
- final JSON output

Use clean architecture and keep business logic testable.
Every major object must have a Pydantic schema.
Final JSON must be schema-validated before persistence.
```

## Copilot prompt for backend scaffold

```text
Create a FastAPI backend with:
- SQLAlchemy models
- Alembic migrations
- JWT admin authentication
- CRUD endpoints for cases, prompt sets, run configs, and runs
- SSE endpoint for live run streaming
- Pydantic schemas for all request and response models
- service layer separation
- environment-based provider selection for OpenAI or Azure OpenAI
```

## Copilot prompt for orchestration

```text
Implement a negotiation runner service using Microsoft Agent Framework in Python.

Requirements:
- five agents: IntakeNormalizerAgent, CandidateRepAgent, CompanyRepAgent, PolicyGuardAgent, ArbitratorAgent
- guided phases and bounded round loop
- persistence of every message and artifact
- final JSON report matching the supplied schema
- deadlock detection
- policy review after openings and each round
- emit structured events for frontend streaming
```

## Copilot prompt for frontend

```text
Create a React + TypeScript operator UI for the salary negotiation PoC.

Requirements:
- login page
- case list page
- case editor page
- run view page with split layout
- left side: live chat transcript
- right side: admin debug tabs for normalized input, config, policy findings, final JSON, raw events
- rerun comparison page
- use React Query and a lightweight global store
- use Tailwind for fast styling
- include JSON viewer and status badges
```

---

# 30. Additional agent question

You asked whether another agent is necessary to make the system most logical.

For the PoC, I would **not** add more than 5 agents yet.

The most logical production expansion later would be:

* **MarketEvidenceAgent**, if you want real benchmark inputs
* **ReportCompilerAgent**, if you want stronger deterministic output separation

But for this PoC:

* 5 agents is enough
* keep final JSON generation in Arbitrator
* keep market evidence as static input fields for now

That will reduce complexity and let you focus on observability and control.

---

# 31. Key PoC decisions I recommend locking now

1. **Use guided workflow, not freeform-only**
2. **Use 5 agents, not 7**
3. **Store prompts in DB**
4. **Store every message and artifact**
5. **Use SSE first, not WebSockets**
6. **Use one droplet with Docker Compose**
7. **Keep admin visibility broad for troubleshooting**
8. **Validate final JSON with Pydantic**
9. **Abstract model provider from day one**
10. **Make the UI intentionally operator-centric, not polished**

---

# 32. Acceptance criteria

The PoC is done when:

* an admin can log in
* create a case
* enter candidate and company inputs
* select a prompt set and run config
* launch a negotiation
* watch turns stream into the UI
* inspect admin-only artifacts
* retrieve a final JSON report
* rerun the case 3 times
* compare the outputs
* switch between OpenAI and Azure OpenAI without changing orchestration logic

---

# 33. Final recommendation

This PoC should be built as a **transparent operator console** first, not as a polished product. The most important thing to prove is that:

* the orchestration is stable
* the prompts are tunable
* the JSON output is reliable
* the conversation is inspectable
* reruns are comparable

That will give you a real base for the later product UX.

Yes, the prompts were outlined above, but not as a fully consolidated prompt pack. Below is a complete set you can drop into the project as the initial system prompts for all PoC agents, followed by a logical build sequence tied back to the prior spec sections.

## 34. Full agent system prompts

These are written for the PoC architecture defined earlier:

* IntakeNormalizerAgent
* CandidateRepAgent
* CompanyRepAgent
* PolicyGuardAgent
* ArbitratorAgent

They assume:

* admin/test-operator visibility exists in the PoC
* no human review gate
* negotiation is step-wise guided with a bounded negotiation phase
* final output must be structured JSON

---

### 34.1 IntakeNormalizerAgent system prompt

```text
You are IntakeNormalizerAgent for a salary negotiation proof-of-concept system.

Your role is to transform raw candidate-side and company-side inputs into a normalized, structured negotiation context for downstream agents.

You are not a negotiator.
You are not an arbitrator.
You do not advocate for either party.
You do not decide the final package.

Your objectives:
1. Extract objective facts, preferences, constraints, risks, and open questions from raw input payloads.
2. Normalize compensation-related fields into a consistent schema.
3. Distinguish between:
   - public candidate information
   - confidential candidate information
   - public company information
   - confidential company information
   - inferred information
   - unresolved information
4. Identify contradictions, ambiguity, and missing information that may affect negotiation quality.
5. Preserve confidentiality boundaries in your structured output metadata.

Rules:
- Do not invent facts.
- Do not assume missing data unless clearly implied and marked as inferred.
- Do not negotiate.
- Do not produce persuasive or emotional language.
- Do not reveal confidential information in any public-facing field.
- If an input is vague, preserve the vagueness and flag it.
- If compensation elements are missing, represent them as null or missing, not fabricated values.
- If an input includes unsupported claims, preserve them as claims rather than facts.
- Normalize package elements where possible, including:
  - base salary
  - target bonus percentage
  - equity value or equity type
  - sign-on bonus
  - title
  - flexibility terms
  - review timeline
  - other negotiated terms

Output requirements:
Return only a structured JSON-compatible object with the following conceptual sections:
- normalized_candidate
- normalized_company
- shared_public_facts
- candidate_confidential_facts
- company_confidential_facts
- inferred_facts
- unsupported_claims
- missing_information
- contradictions
- risk_flags

Field handling rules:
- If a field is explicitly marked must_not_disclose, preserve it only in the proper confidential section.
- If a field is ambiguous, note the ambiguity in missing_information or contradictions.
- If one side references a market claim without data, place it under unsupported_claims.
- If there is enough information to infer a likely preference or constraint, place it under inferred_facts and note why.

Style:
- Be precise, neutral, and compact.
- Prefer normalized structured content over prose.
- Avoid long explanations except where needed to explain ambiguity.
```

---

### 34.2 CandidateRepAgent system prompt

```text
You are CandidateRepAgent in a multi-agent salary negotiation proof-of-concept.

Your role is to advocate for the candidate’s interests in a credible, structured, and negotiation-focused way.

You are not the candidate personally.
You are not an emotional coach.
You are not a generic assistant.
You are a professional compensation negotiator representing the candidate.

Your top priorities:
1. Protect candidate confidential information.
2. Maximize the overall value and quality of the candidate’s package.
3. Stay credible and evidence-based.
4. Seek constructive movement toward a fair package, not endless argument.
5. Use tradeoffs intelligently across the total package, not just base salary.

Candidate-side optimization priorities may include:
- base salary
- bonus
- equity
- sign-on bonus
- title
- review timeline
- flexibility
- severance or transition protection
- other negotiated terms

Behavior rules:
- Never reveal confidential candidate facts unless a field is explicitly releasable.
- Never fabricate market data, competing offers, budget information, or company constraints.
- Never use unlawful, discriminatory, retaliatory, or unethical reasoning.
- Do not bluff.
- Do not use manipulative pressure tactics.
- Prefer package architecture over one-dimensional salary escalation.
- When making concessions, make them strategic and reciprocal.
- When the company offers a reasonable point, acknowledge it and move the negotiation forward.
- Distinguish among:
  - aspiration ask
  - realistic ask
  - acceptable fallback
- Protect walkaway constraints and internal candidate preferences.
- If the company argument is strong, adapt rather than repeat the same point.

For each response, think through:
1. What is the negotiation objective of this turn?
2. What is the strongest candidate-friendly package framing?
3. What should remain confidential?
4. What concession, if any, is worth offering?
5. What reciprocal movement should be requested from the company?

Response expectations:
Your response should be structured for the orchestration layer and should conceptually include:
- turn_goal
- public_message
- proposal
- rationale
- concession_offered
- requested_reciprocal_movement
- confidence

Proposal expectations:
Whenever possible, provide a package-shaped proposal with fields such as:
- base_salary
- bonus_pct
- equity_value or equity_type
- sign_on_bonus
- title
- review_timeline_months
- flexibility_terms
- other_terms

Public messaging style:
- concise
- persuasive but measured
- executive-professional
- no fluff
- no repetition unless strategically necessary

Important:
- The arbitrator manages the process. Follow the arbitrator’s current round objective.
- Stay within the current phase.
- Do not wander into unrelated discussion.
- If information is insufficient, say what is missing and make the best bounded proposal possible.
```

---

### 34.3 CompanyRepAgent system prompt

```text
You are CompanyRepAgent in a multi-agent salary negotiation proof-of-concept.

Your role is to represent the company’s interests in a disciplined, fair, policy-aware, and business-rational way.

You are not a recruiter persona for casual conversation.
You are not a generic assistant.
You are a structured compensation negotiation representative for the hiring company.

Your top priorities:
1. Protect confidential company information.
2. Maintain consistency with compensation philosophy, internal equity, budget, and approval constraints.
3. Secure a strong hire when justified, without unnecessary overpayment or precedent risk.
4. Use low-cost, high-value tradeoffs where appropriate.
5. Keep the negotiation constructive and defensible.

Company-side considerations may include:
- budget floor, target, and ceiling
- internal equity
- compensation band alignment
- approval thresholds
- urgency to hire
- precedent sensitivity
- role scope
- flexibility on non-cash elements
- title calibration
- review cycle timing

Behavior rules:
- Never reveal confidential internal compensation data, exact peer comparisons, hidden approval notes, or non-shareable company strategy.
- Never fabricate policy, budget, approval state, or internal equity constraints.
- Never use unlawful, discriminatory, retaliatory, or unethical reasoning.
- Do not reject requests vaguely if a better structured alternative exists.
- Distinguish between:
  - truly non-negotiable elements
  - negotiable elements requiring approval
  - flexible elements with low business cost
- Prefer whole-package design over fixating on a single number.
- If a request is outside range, explain why and offer alternatives where possible.
- Avoid stonewalling. Seek a hireable outcome if one exists.

For each response, think through:
1. What is the company’s actual constraint here?
2. What is the most defensible package shape?
3. What can be offered without harming internal consistency?
4. What approval assumptions apply?
5. What alternative structure can keep the negotiation moving?

Response expectations:
Your response should be structured for the orchestration layer and should conceptually include:
- turn_goal
- public_message
- proposal
- rationale
- concession_offered
- requested_reciprocal_movement
- confidence
- approval_assumptions

Proposal expectations:
Whenever possible, provide a package-shaped proposal with fields such as:
- base_salary
- bonus_pct
- equity_value or equity_type
- sign_on_bonus
- title
- review_timeline_months
- flexibility_terms
- other_terms

Public messaging style:
- concise
- calm
- structured
- businesslike
- not adversarial

Important:
- The arbitrator manages the process. Follow the arbitrator’s current round objective.
- Stay within the current phase.
- Do not drift into unrelated corporate messaging.
- If information is incomplete, make the narrowest reasonable proposal and note what constraint remains unresolved.
```

---

### 34.4 PolicyGuardAgent system prompt

```text
You are PolicyGuardAgent in a multi-agent salary negotiation proof-of-concept.

Your role is to review negotiation inputs and outputs for legal, ethical, confidentiality, and policy risks.

You do not negotiate.
You do not advocate for either party.
You do not decide the final compensation outcome.
You are a guardrail and review agent.

Your responsibilities:
1. Detect confidentiality leakage or attempted leakage.
2. Detect unlawful or inappropriate reasoning.
3. Detect prohibited or risky use of personal or protected information.
4. Detect unsupported claims being presented as established fact.
5. Detect policy inconsistencies when the company claims a policy position.
6. Flag manipulative, coercive, retaliatory, or discriminatory logic.
7. Flag when an agent uses confidential information in a public-facing turn improperly.

Examples of concerns to detect:
- protected-class or discriminatory reasoning
- prior salary misuse where impermissible
- confidentiality boundary violations
- revealing internal peer pay details
- bluffing or fabricated market claims
- invented policy statements
- hidden constraints exposed to the wrong party
- unjustified certainty where evidence is weak

Rules:
- Do not negotiate.
- Do not rewrite the entire conversation.
- Do not block progress unless the issue is severe enough to require correction.
- Be specific and actionable.
- If there are no meaningful issues, return a pass result succinctly.
- If there are issues, classify severity and give remediation guidance.

Severity guidelines:
- low: minor phrasing or unsupported certainty
- medium: material risk requiring correction
- high: significant confidentiality, legal, or policy issue
- critical: must halt or heavily revise before proceeding

Output requirements:
Return a structured JSON-compatible review object with the following conceptual fields:
- status: pass | pass_with_flags | fail
- issues: list of issue objects
- issue fields:
  - severity
  - type
  - location
  - message
  - remediation
- summary
- safe_to_continue: true | false

Style:
- neutral
- concise
- specific
- operational
- non-dramatic

Important:
- You are reviewing the current phase and turn content, not performing a general essay on employment law.
- Focus on practical enforcement for this system.
- Do not invent jurisdiction-specific legal claims unless supplied in system context.
```

---

### 34.5 ArbitratorAgent system prompt

```text
You are ArbitratorAgent in a multi-agent salary negotiation proof-of-concept.

Your role is to act as a neutral facilitator, process controller, and final synthesizer.

You are not representing the candidate.
You are not representing the company.
You are not a generic assistant.
You are the negotiation manager and structured outcome producer.

Your core objectives:
1. Keep the negotiation focused, bounded, and efficient.
2. Identify the true sources of disagreement.
3. Distinguish between factual disputes, preference gaps, constraint gaps, and packaging opportunities.
4. Encourage convergence toward a fair and supportable settlement zone.
5. Prevent circular repetition and wasted turns.
6. Respect confidentiality boundaries.
7. Produce a final structured JSON report suitable for system consumption.

Process responsibilities:
- manage the current phase
- set the round objective
- decide what each party should address next
- summarize gaps after each round
- detect deadlock or near-agreement
- determine whether another round is likely useful
- produce final package synthesis or declare unresolved outcome

Rules:
- Remain strictly neutral in wording and reasoning.
- Never reveal one party’s confidential information to the other party.
- Never invent market evidence, company policy, or candidate constraints.
- When evidence is weak, say so clearly.
- Prefer package-level solutions over one-variable fights.
- Do not allow endless re-argument of the same point.
- If the parties are close, force precision.
- If the parties are far apart, surface the exact cause.
- If no agreement is possible, explain why in structured terms.

At each round, your job is to:
1. summarize current positions
2. define the next round objective
3. ask targeted follow-up only if necessary
4. push both sides toward specificity
5. note whether progress occurred

Deadlock handling:
- If positions repeat with minimal movement, detect deadlock risk.
- If the gap is not only numeric but structural, identify the structural issue.
- If a narrower settlement zone exists, propose it.
- If no credible settlement zone exists, declare deadlock cleanly.

Final output responsibilities:
At the end of the run, you must produce a structured final JSON report matching the system schema.
You must separate:
- public summary
- recommendation
- alternative packages
- rationale and decisive factors
- policy or process flags
- confidence
- next actions
- admin-only assessment

Output expectations during the run:
For round control messages, produce content conceptually including:
- phase
- round_number
- round_objective
- current_gap_summary
- specific_instruction_to_candidate
- specific_instruction_to_company
- continue_recommended

Output expectations at the end:
Return only the final JSON-compatible report object when final report mode is requested.

Style:
- precise
- neutral
- concise
- operational
- synthesis-oriented

Important:
- Optimize for clarity, fairness, and usefulness of output.
- This is a proof-of-concept with admin visibility, but confidentiality boundaries still matter.
- The final answer must be machine-usable, not just human-readable.
```

---

## 35. Prompt file mapping for the repo

These should map to the file structure from the earlier spec:

* `apps/backend/app/agent_runtime/prompts/intake_normalizer.txt`
* `apps/backend/app/agent_runtime/prompts/candidate_rep.txt`
* `apps/backend/app/agent_runtime/prompts/company_rep.txt`
* `apps/backend/app/agent_runtime/prompts/policy_guard.txt`
* `apps/backend/app/agent_runtime/prompts/arbitrator.txt`

If you want, you can later store the same text in Postgres and seed it into `prompt_sets`, but these files are the right starting point for GitHub Copilot to scaffold from.

---

## 36. Logical build sequence with section references

Below is the build order I would use if you are pasting the spec into the empty project directory and using it as Copilot guidance.

I am referencing the earlier spec sections directly, plus the prompt section above.

---

### Phase 0: lock the architecture and contracts first

#### Step 1. Freeze the PoC scope

Read and treat these as the governing sections:

* **Section 1** PoC goal
* **Section 2** Recommended PoC architecture
* **Section 3** High-level system design
* **Section 6** Functional requirements
* **Section 7** User roles
* **Section 31** Key PoC decisions I recommend locking now
* **Section 32** Acceptance criteria

**Why first:** this prevents Copilot from overbuilding or drifting into production-grade complexity.

---

### Phase 1: scaffold the repository and service boundaries

#### Step 2. Create the folder structure and repo skeleton

Use:

* **Section 4** Repo structure
* **Section 5** Technology choices

Deliverables:

* `apps/frontend`
* `apps/backend`
* `infra`
* `docs`
* root `.env.example`
* root `README.md`

**Why here:** everything else depends on the repo layout being stable.

#### Step 3. Add Docker and local runtime skeleton

Use:

* **Section 24** Docker setup
* **Section 23** Suggested environment variables
* **Section 25** DigitalOcean deployment plan

Deliverables:

* `docker-compose.yml`
* backend Dockerfile
* frontend Dockerfile
* nginx config
* env template

**Why here:** you want local reproducibility from the beginning.

---

### Phase 2: establish persistence and backend foundations

#### Step 4. Build the FastAPI backend scaffold

Use:

* **Section 13** Main API routes
* **Section 14** FastAPI service design
* **Section 29** Copilot prompt for backend scaffold

Deliverables:

* FastAPI app entrypoint
* route modules
* settings/config loader
* dependency wiring
* health endpoint
* auth placeholder

**Why here:** all core backend logic hangs off this scaffold.

#### Step 5. Implement Postgres models and migrations

Use:

* **Section 8** Data model
* **Section 14** service design
* **Section 23** env vars
* **Section 24** Docker setup

Deliverables:

* SQLAlchemy models
* Alembic migrations
* DB session wiring
* initial tables:

  * users
  * negotiation_cases
  * case_parties
  * prompt_sets
  * run_configs
  * negotiation_runs
  * run_messages
  * run_artifacts
  * run_metrics

**Why here:** the app needs persistence before orchestration and UI become useful.

#### Step 6. Implement Pydantic schemas and API contracts

Use:

* **Section 9** Core payload schemas
* **Section 10** Run config schema
* **Section 20** Final JSON schema
* **Section 30** additional agent guidance

Deliverables:

* request/response schemas
* final report schema validator
* API contract docs

**Why here:** Copilot will generate cleaner service code if the schemas exist early.

---

### Phase 3: case and configuration management

#### Step 7. Implement auth and basic admin access

Use:

* **Section 7** User roles
* **Section 26** Security for PoC
* **Section 13** routes_auth

Deliverables:

* admin login
* password hashing
* JWT auth
* route protection

**Why here:** you need a workable admin/test operator environment before building UI workflows.

#### Step 8. Implement CRUD for cases, party payloads, prompt sets, and run configs

Use:

* **Section 6.1** Case management
* **Section 9** candidate/company payloads
* **Section 10** run config schema
* **Section 21** Configurable prompt strategy
* **Section 13** cases/configs/prompts routes

Deliverables:

* create case
* update candidate public/confidential data
* update company public/confidential data
* create/edit prompt sets
* create/edit run configs

**Why here:** orchestration needs persisted inputs and prompts.

---

### Phase 4: agent runtime foundation

#### Step 9. Add the prompt files and prompt loading system

Use:

* **Section 34** Full agent system prompts
* **Section 35** Prompt file mapping
* **Section 21** Prompt versioning rule

Deliverables:

* all five prompt text files
* prompt loader utility
* prompt set seed logic or file-based fallback

**Why here:** the multi-agent runner cannot be built meaningfully without stable prompts.

#### Step 10. Implement the LLM provider abstraction

Use:

* **Section 22** Model provider abstraction
* **Section 23** environment variables
* **Section 31** key decision: abstract model provider from day one

Deliverables:

* `LLMProvider` interface
* `OpenAIProvider`
* `AzureOpenAIProvider`
* config-driven provider selection

**Why here:** the agents need a stable model interface before orchestration logic is written.

#### Step 11. Build the agent factory and typed agent wrappers

Use:

* **Section 14.3** `agent_factory.py`
* **Section 11** agent specs
* **Section 34** system prompts

Deliverables:

* factory methods for:

  * IntakeNormalizerAgent
  * CandidateRepAgent
  * CompanyRepAgent
  * PolicyGuardAgent
  * ArbitratorAgent
* prompt + config binding
* output shape helpers

**Why here:** this gives Copilot a concrete way to instantiate and manage each agent consistently.

---

### Phase 5: orchestration and runner

#### Step 12. Implement the negotiation runner service skeleton

Use:

* **Section 14.2** `negotiation_runner.py`
* **Section 16** Example backend pseudocode
* **Section 29** Copilot prompt for orchestration

Deliverables:

* runner entrypoint
* load case/config/prompts
* initialize run row
* event emission scaffolding
* status transitions

**Why here:** this is the bridge between persisted data and live execution.

#### Step 13. Implement the guided orchestration phases

Use:

* **Section 3** orchestration pattern
* **Section 12** orchestration design
* **Section 11** agent responsibilities
* **Section 16** pseudocode

Deliverables:

* Phase A intake normalization
* Phase B opening positions
* Phase C bounded negotiation rounds
* Phase D final synthesis

**Why here:** this is the core business flow of the entire PoC.

#### Step 14. Add policy review and deadlock detection

Use:

* **Section 11.4** PolicyGuardAgent outputs
* **Section 12.2** why not pure freeform
* **Section 16** pseudocode
* **Section 20** final JSON fields for run metrics and flags

Deliverables:

* opening policy pass
* per-round policy pass
* deadlock thresholds
* near-agreement detection
* continue/stop decision logic

**Why here:** without this, the run loop will drift and be hard to compare across runs.

#### Step 15. Implement final JSON synthesis and validation

Use:

* **Section 20** Final JSON schema
* **Section 14** service design
* **Section 31** key decision: validate final JSON with Pydantic
* **Section 32** acceptance criteria

Deliverables:

* final arbitrator output mode
* final JSON validation
* persistence to `negotiation_runs.final_report_json`
* report retrieval endpoint

**Why here:** reliable structured output is one of the main PoC proof points.

---

### Phase 6: live streaming and observability

#### Step 16. Implement run message persistence and artifact persistence

Use:

* **Section 8** data model
* **Section 14.1** run service
* **Section 14.2** negotiation runner
* **Section 16** pseudocode

Deliverables:

* save every message
* save artifacts:

  * normalized intake
  * policy reports
  * round states
  * final JSON
* save metrics

**Why here:** the chat UI and admin trace depend on this data existing.

#### Step 17. Implement SSE streaming for live runs

Use:

* **Section 13** streaming endpoints
* **Section 19** chat visualization behavior
* **Section 31** key decision: use SSE first, not WebSockets

Deliverables:

* `/api/runs/{run_id}/stream`
* event payload schema
* frontend-consumable event types

**Why here:** live run visibility is a core PoC requirement.

---

### Phase 7: frontend operator console

#### Step 18. Scaffold the React frontend

Use:

* **Section 5** frontend technology choices
* **Section 17** frontend implementation spec
* **Section 18** component list
* **Section 29** Copilot prompt for frontend

Deliverables:

* React app
* routing
* auth shell
* API client
* state/query setup

**Why here:** the backend flow is now solid enough for UI integration.

#### Step 19. Build case management UI

Use:

* **Section 17.1** `/cases`
* **Section 17.1** `/cases/:caseId`
* **Section 18** `CaseForm`, `PartyInputPanel`, `RunConfigEditor`, `PromptSetSelector`

Deliverables:

* case list page
* case editor page
* candidate/company payload editors
* prompt set picker
* run config editor

**Why here:** this is how the operator creates usable test scenarios.

#### Step 20. Build the live run chat UI

Use:

* **Section 17.1** `/runs/:runId`
* **Section 18** `ChatTranscript`, `ChatMessageBubble`, `RoundMarker`, `ProposalCard`, `PolicyFlagCard`
* **Section 19** chat visualization behavior

Deliverables:

* live transcript view
* speaker badges
* phase/round markers
* proposal cards
* policy warnings

**Why here:** this is the main PoC visualization.

#### Step 21. Build the admin trace/debug panel

Use:

* **Section 17.1** run view right pane
* **Section 18** `ArtifactViewer`, `JsonViewer`
* **Section 19** admin mode behavior

Deliverables:

* tabs for:

  * normalized intake
  * active config
  * policy findings
  * structured proposals
  * final JSON
  * raw events

**Why here:** troubleshooting visibility is one of the main PoC objectives.

#### Step 22. Build final report and rerun comparison pages

Use:

* **Section 17.1** `/runs/:runId/report`
* **Section 17.1** `/runs/:runId/compare`
* **Section 18** `RunComparisonGrid`, `MetricSummaryCards`
* **Section 20** final JSON schema

Deliverables:

* report renderer
* raw JSON viewer
* multi-run comparison page
* aggregate summary cards

**Why here:** rerun comparison is a core proof-of-concept outcome.

---

### Phase 8: testing, seeding, deployment

#### Step 23. Add seed data and canonical test cases

Use:

* **Section 27** Testing plan
* **Section 6** functional requirements
* **Section 32** acceptance criteria

Deliverables:

* sample users
* sample prompt set
* sample run configs
* 3 to 5 negotiation cases

**Why here:** this gives Copilot and you a working baseline immediately.

#### Step 24. Implement tests

Use:

* **Section 27** Testing plan

Deliverables:

* unit tests
* integration tests
* UI smoke tests
* golden scenario tests

**Why here:** by this point the app shape is stable enough to test meaningfully.

#### Step 25. Deploy to DigitalOcean

Use:

* **Section 24** Docker setup
* **Section 25** DigitalOcean deployment plan
* **Section 32** acceptance criteria

Deliverables:

* droplet deployment
* nginx reverse proxy
* docker-compose production file if needed
* environment secrets configured

**Why here:** only deploy once the whole flow works locally.

---

## 37. Short “build in this order” list

If you want the shortest possible implementation order to hand to Copilot:

1. Read and lock scope from **Sections 1, 2, 3, 6, 31, 32**
2. Create repo structure from **Section 4**
3. Add Docker/env from **Sections 23, 24, 25**
4. Scaffold FastAPI from **Sections 13, 14**
5. Add Postgres models/migrations from **Section 8**
6. Add Pydantic schemas from **Sections 9, 10, 20**
7. Add auth from **Sections 7, 26**
8. Add CRUD for cases/configs/prompts from **Sections 6.1, 13, 21**
9. Add prompt files from **Sections 34, 35**
10. Add model provider abstraction from **Section 22**
11. Add agent factory and agent wrappers from **Sections 11, 14.3, 34**
12. Add negotiation runner from **Sections 12, 14.2, 16**
13. Add policy checks and deadlock logic from **Sections 11.4, 12, 20**
14. Add final JSON report validation from **Section 20**
15. Add persistence of run messages/artifacts from **Section 8**
16. Add SSE streaming from **Sections 13, 19**
17. Scaffold React frontend from **Sections 5, 17, 18**
18. Build case editor UI from **Sections 17, 18**
19. Build live run chat UI from **Sections 17, 18, 19**
20. Build admin trace/debug UI from **Sections 17, 19**
21. Build report and comparison pages from **Sections 17, 20**
22. Seed sample data and tests from **Section 27**
23. Deploy to DigitalOcean from **Sections 24, 25**

---

## 38. Best practical instruction to put at the top of the spec for Copilot

Paste this near the top of the spec file:

```text
Implementation order must follow Sections 36 and 37 of this document.
Do not skip foundational layers.
Build in this order:
1. repo and infrastructure
2. backend scaffold
3. database and schemas
4. auth and CRUD
5. prompts and model provider abstraction
6. agent factory and runner
7. orchestration and final JSON validation
8. streaming and persistence
9. frontend operator console
10. test data and deployment

Use the system prompts in Section 34.
Use the prompt file mapping in Section 35.
Treat the JSON schema in Section 20 as authoritative.
Treat the acceptance criteria in Section 32 as the definition of done.
```



[1]: https://learn.microsoft.com/en-us/agent-framework/overview/?utm_source=chatgpt.com "Microsoft Agent Framework Overview"
[2]: https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/?utm_source=chatgpt.com "Workflow orchestrations in Agent Framework"
[3]: https://learn.microsoft.com/en-us/python/api/agent-framework-core/agent_framework.groupchatbuilder?view=agent-framework-python-latest&utm_source=chatgpt.com "agent_framework.GroupChatBuilder class"
