1. Implementation Philosophy

The system must be built layer by layer, ensuring stable foundations before implementing orchestration or UI features.

The correct order is:

Architecture foundation
Infrastructure and environment
Backend scaffold
Data layer
Core domain APIs
Agent runtime
Negotiation orchestration
Event streaming
Frontend operator console
Testing and deployment

Skipping layers will create unstable behavior and prevent Copilot from generating correct code.

2. Phase 0 – Lock Architecture and Scope

Before coding begins, review the governing sections in the main document.

Reference:

SYSTEM_SPEC.md sections:

Section 1 – PoC goal
Section 2 – Architecture overview
Section 3 – System design
Section 6 – Functional requirements
Section 31 – PoC design decisions
Section 32 – Acceptance criteria

Outcome:

confirm architecture
confirm agent roles
confirm final JSON output schema
confirm technology stack

Nothing should be implemented until these are agreed.

3. Phase 1 – Repository and Infrastructure

Reference:

SYSTEM_SPEC.md sections:

Section 4 – Repo structure
Section 5 – Technology choices
Section 23 – Environment variables
Section 24 – Docker setup
Section 25 – DigitalOcean deployment plan

Steps:

Step 1 – Create repository structure

Create directories exactly as defined in Section 4.

Expected root layout:

apps/
  frontend/
  backend/

infra/
docs/

.env.example
README.md
SYSTEM_SPEC.md
IMPLEMENTATION_SEQUENCE.md
Step 2 – Add Docker infrastructure

Implement:

docker-compose.yml
backend Dockerfile
frontend Dockerfile
nginx config

Goal:

The system must run locally with:

docker compose up

Services:

postgres
backend
frontend
nginx
4. Phase 2 – Backend Foundation

Reference:

SYSTEM_SPEC.md sections:

Section 13 – API routes
Section 14 – FastAPI design

Steps:

Step 3 – FastAPI scaffold

Create the base backend:

apps/backend/app/main.py

Add:

settings loader
health endpoint
router registration
logging setup

Routers to create:

routes_auth
routes_cases
routes_runs
routes_prompts
routes_configs
routes_admin
routes_ws
Step 4 – Database layer

Reference:

SYSTEM_SPEC.md Section 8 – Data model

Implement:

SQLAlchemy models
Alembic migrations
database session management

Tables required:

users
negotiation_cases
case_parties
prompt_sets
run_configs
negotiation_runs
run_messages
run_artifacts
run_metrics
Step 5 – API schemas

Reference:

SYSTEM_SPEC.md sections:

Section 9 – Payload schemas
Section 10 – Run config schema
Section 20 – Final JSON schema

Implement:

Pydantic request models
response models
final report schema validator

The final JSON schema must be strictly validated before persistence.

5. Phase 3 – Core Application APIs

Reference:

SYSTEM_SPEC.md sections:

Section 6 – Functional requirements
Section 13 – API endpoints

Steps:

Step 6 – Authentication

Reference:

SYSTEM_SPEC.md Section 26 – Security

Implement:

admin login
password hashing
JWT tokens
protected routes
Step 7 – Case management APIs

Implement CRUD:

POST /cases
GET /cases
GET /cases/{id}
PUT /cases/{id}

Case payloads must support:

candidate public data
candidate confidential data
company public data
company confidential data

Reference:

SYSTEM_SPEC.md Section 9

Step 8 – Prompt sets and run configs

Implement CRUD:

POST /prompts
GET /prompts
PUT /prompts/{id}

POST /configs
GET /configs

Reference:

SYSTEM_SPEC.md Section 21

6. Phase 4 – Agent Runtime

Reference:

SYSTEM_SPEC.md sections:

Section 11 – Agent specs
Section 22 – LLM provider abstraction
Section 34 – System prompts
Section 35 – Prompt file mapping

Steps:

Step 9 – Prompt files

Create prompt files:

prompts/intake_normalizer.txt
prompts/candidate_rep.txt
prompts/company_rep.txt
prompts/policy_guard.txt
prompts/arbitrator.txt

Content comes from:

SYSTEM_SPEC.md Section 34

Step 10 – LLM provider abstraction

Implement interface:

LLMProvider

Providers:

OpenAIProvider
AzureOpenAIProvider

Reference:

SYSTEM_SPEC.md Section 22

Step 11 – Agent factory

Create:

agent_factory.py

Responsibilities:

load prompt
attach model provider
attach config
construct agent instance

Agents:

IntakeNormalizerAgent
CandidateRepAgent
CompanyRepAgent
PolicyGuardAgent
ArbitratorAgent
7. Phase 5 – Negotiation Orchestration

Reference:

SYSTEM_SPEC.md sections:

Section 12 – Orchestration design
Section 16 – Runner pseudocode

Steps:

Step 12 – Negotiation runner

Implement:

negotiation_runner.py

Responsibilities:

load case
load config
load prompts
create agents
manage run lifecycle
Step 13 – Guided workflow phases

Implement phases:

intake normalization
candidate opening
company opening
policy review
negotiation rounds
arbitrator synthesis

Reference:

SYSTEM_SPEC.md Section 12

Step 14 – Deadlock and policy checks

Add logic for:

repeated position detection
deadlock risk
policy guard review

Reference:

SYSTEM_SPEC.md Section 11.4

Step 15 – Final JSON output

The ArbitratorAgent must produce the final report.

Reference:

SYSTEM_SPEC.md Section 20

Requirements:

validate with Pydantic
store in database
expose via API
8. Phase 6 – Run Streaming and Observability

Reference:

SYSTEM_SPEC.md sections:

Section 13 – Streaming routes
Section 19 – Chat visualization

Steps:

Step 16 – Message persistence

Every agent message must be stored in:

run_messages

Artifacts stored in:

run_artifacts
Step 17 – SSE streaming

Implement endpoint:

GET /runs/{run_id}/stream

Frontend should receive events:

message
status
artifact
completion
9. Phase 7 – React Frontend

Reference:

SYSTEM_SPEC.md sections:

Section 17 – Frontend design
Section 18 – Components
Section 19 – Chat visualization

Steps:

Step 18 – Frontend scaffold

Stack:

React
TypeScript
Vite
React Query
Tailwind
Step 19 – Case editor UI

Implement:

/cases
/cases/:id

Features:

candidate inputs
company inputs
prompt selection
config selection
Step 20 – Live negotiation chat

Implement:

/runs/:runId

Layout:

Left:

chat transcript

Right:

admin debug panel
Step 21 – Report and comparison pages

Implement:

/runs/:runId/report
/runs/:runId/compare

Reference:

SYSTEM_SPEC.md Section 20

10. Phase 8 – Testing and Deployment

Reference:

SYSTEM_SPEC.md sections:

Section 27 – Testing plan
Section 24 – Docker setup
Section 25 – DigitalOcean deployment
Section 32 – Acceptance criteria

Steps:

Step 22 – Seed test cases

Create:

example prompt set
example run config
3–5 negotiation cases
Step 23 – Tests

Add:

unit tests
integration tests
UI smoke tests
Step 24 – Deployment

Deploy to DigitalOcean droplet using:

docker compose up -d
11. Definition of Done

The PoC is complete when the system meets the acceptance criteria defined in:

SYSTEM_SPEC.md Section 32

Specifically:

admin login works
cases can be created
negotiations can be executed
chat visualization updates live
final JSON report is generated
multiple runs can be compared
12. Copilot Usage Rule

All GitHub Copilot development should follow this order.

Never implement:

orchestration
UI
streaming

before the backend models and schemas exist.