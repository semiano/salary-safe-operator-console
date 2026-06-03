import json
from random import choice
from uuid import UUID
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.case import NegotiationCase
from app.models.config import RunConfig
from app.models.prompt import PromptSet
from app.models.run import NegotiationRun
from app.models.user import User
from app.schemas.case import (
    CaseCreateFromPromptRequest,
    CaseCreateRequest,
    CasePartyResponse,
    CaseResponse,
    CaseUpdateRequest,
    ParseInvitationsRequest,
    ParseInvitationsResponse,
    ParsedInvitation,
    RandomCasePromptResponse,
    RoleAutofillResponse,
)
from app.schemas.run import RunCreateRequest, RunResponse
from app.agent_runtime.providers import get_provider
from app.services.case_service import CaseService
from app.services.run_service import RunService
from app.workers.negotiation_runner import NegotiationRunner

router = APIRouter(prefix="/cases", tags=["cases"], dependencies=[Depends(get_current_user)])

COMMON_AUTOFILL_TITLES = {
    "senior product marketing manager",
    "software engineer",
    "senior software engineer",
    "product manager",
    "senior product manager",
    "product marketing manager",
    "data scientist",
    "business analyst",
    "marketing manager",
    "digital marketing manager",
    "growth marketing manager",
    "account executive",
    "customer success manager",
    "revenue operations analyst",
    "revenue operations manager",
    "sales operations analyst",
    "sales operations manager",
}

AUTOFILL_FALLBACK_TITLES = [
    "Senior Machine Learning Engineer",
    "Principal Product Designer",
    "Corporate Tax Manager",
    "Data Platform Engineer",
    "Clinical Research Associate",
    "Procurement Category Manager",
    "Civil Infrastructure Project Manager",
    "Hotel General Manager",
    "Insurance Underwriter",
    "Logistics Network Planner",
]


@router.get("/health")
def cases_health() -> dict[str, str]:
    return {"status": "ok"}


def _to_case_response(case: NegotiationCase) -> CaseResponse:
    return CaseResponse(
        id=case.id,
        title=case.title,
        description=case.description,
        created_by=case.created_by,
        status=case.status,
        jurisdiction=case.jurisdiction,
        currency=case.currency,
        operator_guidance=case.operator_guidance,
        created_at=case.created_at,
        updated_at=case.updated_at,
        parties=[
            CasePartyResponse(
                id=party.id,
                case_id=party.case_id,
                party_type=party.party_type,
                public_payload=party.public_payload,
                confidential_payload=party.confidential_payload,
                created_at=party.created_at,
                updated_at=party.updated_at,
            )
            for party in case.parties
        ],
    )


def _to_run_response(run: NegotiationRun) -> RunResponse:
    return RunResponse(
        id=run.id,
        case_id=run.case_id,
        run_config_id=run.run_config_id,
        prompt_set_id=run.prompt_set_id,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        provider=run.provider,
        model_name=run.model_name,
        orchestration_mode=run.orchestration_mode,
        summary_json=run.summary_json,
        final_report_json=run.final_report_json,
        error_text=run.error_text,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def _extract_json_object(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or start >= end:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Model output is not valid JSON")

    candidate = text[start : end + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse generated case JSON: {exc.msg}",
        )


async def _generate_case_payload_from_prompt(payload: CaseCreateFromPromptRequest) -> dict:
    provider = get_provider()
    system_prompt = (
        "You are a case-construction assistant for salary negotiation. "
        "Return only a JSON object with keys: title, description, status, jurisdiction, currency, "
        "candidate_public, candidate_confidential, company_public, company_confidential. "
        "candidate_public should include job_title, job_description, responsibilities (array), "
        "desired_compensation when available. "
        "company_public should include role_scope and budget_context when available. "
        "Use status='draft' unless the prompt explicitly says ready."
    )

    user_prompt = (
        f"Jurisdiction hint: {payload.jurisdiction or 'US'}\n"
        f"Currency hint: {payload.currency}\n"
        f"Operator request:\n{payload.prompt}"
    )

    result = await provider.generate(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=0.1,
    )

    parsed = _extract_json_object(result.get("content", ""))
    title = str(parsed.get("title") or "Generated negotiation case").strip()
    description = parsed.get("description")
    status_value = str(parsed.get("status") or "draft").strip() or "draft"
    jurisdiction_value = str(parsed.get("jurisdiction") or payload.jurisdiction or "US").strip()
    currency_value = str(parsed.get("currency") or payload.currency or "USD").strip().upper()

    candidate_public = parsed.get("candidate_public")
    candidate_confidential = parsed.get("candidate_confidential")
    company_public = parsed.get("company_public")
    company_confidential = parsed.get("company_confidential")

    if not isinstance(candidate_public, dict):
        candidate_public = {}
    if not isinstance(candidate_confidential, dict):
        candidate_confidential = {}
    if not isinstance(company_public, dict):
        company_public = {}
    if not isinstance(company_confidential, dict):
        company_confidential = {}

    return {
        "title": title,
        "description": description if isinstance(description, str) else None,
        "status": status_value,
        "jurisdiction": jurisdiction_value,
        "currency": currency_value,
        "candidate": {
            "public_payload": candidate_public,
            "confidential_payload": candidate_confidential,
        },
        "company": {
            "public_payload": company_public,
            "confidential_payload": company_confidential,
        },
    }


@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseResponse:
    case = CaseService(db).create_case(
        title=payload.title,
        description=payload.description,
        status=payload.status,
        jurisdiction=payload.jurisdiction,
        currency=payload.currency,
        created_by=current_user.id,
        tenant_id=current_user.tenant_id,
        candidate_public=payload.candidate.public_payload,
        candidate_confidential=payload.candidate.confidential_payload,
        company_public=payload.company.public_payload,
        company_confidential=payload.company.confidential_payload,
    )
    return _to_case_response(case)


@router.post("/from-prompt", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case_from_prompt(
    payload: CaseCreateFromPromptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseResponse:
    generated = await _generate_case_payload_from_prompt(payload)

    case = CaseService(db).create_case(
        title=generated["title"],
        description=generated["description"],
        status=generated["status"],
        jurisdiction=generated["jurisdiction"],
        currency=generated["currency"],
        created_by=current_user.id,
        tenant_id=current_user.tenant_id,
        candidate_public=generated["candidate"]["public_payload"],
        candidate_confidential=generated["candidate"]["confidential_payload"],
        company_public=generated["company"]["public_payload"],
        company_confidential=generated["company"]["confidential_payload"],
    )
    return _to_case_response(case)


@router.post("/from-prompt/preview", response_model=CaseCreateRequest)
async def preview_case_from_prompt(payload: CaseCreateFromPromptRequest) -> CaseCreateRequest:
    generated = await _generate_case_payload_from_prompt(payload)
    return CaseCreateRequest(**generated)


@router.post("/autofill-role", response_model=RoleAutofillResponse)
async def autofill_role() -> RoleAutofillResponse:
    """Generate a realistic job listing payload for the Post-a-Role form. Nothing is saved."""
    provider = get_provider()
    system_prompt = (
        "You are a hiring data generator for SalarySafe, a confidential salary-matching platform. "
        "Generate realistic, VARIED corporate job listings that span diverse industries and seniority levels. "
        "Draw from sectors such as: healthcare, finance & banking, manufacturing, retail & consumer goods, "
        "construction & real estate, energy & utilities, legal, education, logistics & supply chain, "
        "hospitality & travel, media & entertainment, pharmaceuticals, government & public sector, "
        "non-profit, agriculture, aerospace & defense, and insurance. "
        "Do NOT over-index on technology, marketing, or revenue/sales-ops roles. "
        "Vary seniority freely: entry-level, mid-career, senior IC, manager, director, VP, and C-suite. "
        "NEVER output any of these overused defaults: "
        "'Revenue Operations Analyst', 'Revenue Operations Manager', "
        "'Sales Operations Analyst', 'Software Engineer', 'Senior Software Engineer', "
        "'Senior Product Marketing Manager', 'Product Manager', 'Data Scientist', "
        "'Marketing Manager', 'Account Executive', 'Customer Success Manager'. "
        "Return ONLY a valid JSON object — no markdown, no explanation — matching this exact schema:\n"
        "{\n"
        '  "job_title": string,\n'
        '  "category": one of [Engineering, Product, Design, Sales, Marketing, Finance, Operations, Legal, \'HR & People\', \'Customer Success\', \'Data & Analytics\', Other],\n'
        '  "work_arrangement": one of [remote, hybrid, onsite],\n'
        '  "location": string (city/state or \'Remote – US only\' etc.),\n'
        '  "job_description": string (2-4 sentences),\n'
        '  "responsibilities": array of 4-6 strings,\n'
        '  "currency": one of [USD, GBP, EUR, CAD, AUD],\n'
        '  "budget_floor": integer (annual salary minimum in whole dollars),\n'
        '  "budget_ceiling": integer (annual salary maximum, must be > budget_floor),\n'
        '  "pto_days": integer between 10 and 30,\n'
        '  "wfh_days_per_week": integer between 0 and 5,\n'
        '  "health_insurance": boolean,\n'
        '  "retirement_401k": boolean,\n'
        '  "dental_vision": boolean,\n'
        '  "stock_options": boolean,\n'
        '  "invitations": array of 2-4 objects each with keys \"name\" (realistic full name) and \"email\" (realistic email)\n'
        "}"
    )
    nonce = uuid4().hex[:8]
    result = await provider.generate(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": f"Generate a varied, realistic job listing for the SalarySafe hiring form. Pick a random industry — favour non-tech sectors this time — and a random seniority level. Randomness token: {nonce}"}],
        temperature=0.85,
    )
    parsed = _extract_json_object(result.get("content", ""))

    job_title = str(parsed.get("job_title") or "").strip()
    if not job_title or job_title.casefold() in COMMON_AUTOFILL_TITLES:
        retry_nonce = uuid4().hex[:8]
        retry_result = await provider.generate(
            system_prompt=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Generate a realistic job listing from a non-tech, non-marketing industry "
                        "(e.g. healthcare, manufacturing, finance, logistics, hospitality, legal). "
                        f"The previous title '{job_title or 'unknown'}' was rejected as too generic. "
                        f"Randomness token: {retry_nonce}"
                    ),
                }
            ],
            temperature=1.0,
        )
        parsed = _extract_json_object(retry_result.get("content", ""))
        job_title = str(parsed.get("job_title") or "").strip()

    # Coerce and validate fields with safe fallbacks
    if job_title and job_title.casefold() in COMMON_AUTOFILL_TITLES:
        job_title = ""

    if not job_title:
        job_title = choice(AUTOFILL_FALLBACK_TITLES)
    category = str(parsed.get("category") or "Engineering").strip()
    work_arrangement = str(parsed.get("work_arrangement") or "hybrid").strip()
    if work_arrangement not in {"remote", "hybrid", "onsite"}:
        work_arrangement = "hybrid"
    location = str(parsed.get("location") or "New York, NY").strip()
    job_description = str(parsed.get("job_description") or "").strip()
    responsibilities_raw = parsed.get("responsibilities") or []
    responsibilities = [str(r).strip() for r in responsibilities_raw if r] if isinstance(responsibilities_raw, list) else []
    currency = str(parsed.get("currency") or "USD").strip().upper()
    if currency not in {"USD", "GBP", "EUR", "CAD", "AUD"}:
        currency = "USD"
    try:
        budget_floor = int(parsed.get("budget_floor") or 80000)
    except (TypeError, ValueError):
        budget_floor = 80000
    try:
        budget_ceiling = int(parsed.get("budget_ceiling") or 120000)
    except (TypeError, ValueError):
        budget_ceiling = 120000
    if budget_ceiling <= budget_floor:
        budget_ceiling = budget_floor + 20000
    try:
        pto_days = max(0, min(365, int(parsed.get("pto_days") or 15)))
    except (TypeError, ValueError):
        pto_days = 15
    try:
        wfh_days = max(0, min(5, int(parsed.get("wfh_days_per_week") or 2)))
    except (TypeError, ValueError):
        wfh_days = 2
    invitations_raw = parsed.get("invitations") or []
    invitations = [
        {"name": str(inv.get("name", "")).strip(), "email": str(inv.get("email", "")).strip()}
        for inv in (invitations_raw if isinstance(invitations_raw, list) else [])
        if isinstance(inv, dict) and inv.get("name") and inv.get("email")
    ]
    return RoleAutofillResponse(
        job_title=job_title,
        category=category,
        work_arrangement=work_arrangement,
        location=location,
        job_description=job_description,
        responsibilities=responsibilities,
        currency=currency,
        budget_floor=budget_floor,
        budget_ceiling=budget_ceiling,
        pto_days=pto_days,
        wfh_days_per_week=wfh_days,
        health_insurance=bool(parsed.get("health_insurance", True)),
        retirement_401k=bool(parsed.get("retirement_401k", True)),
        dental_vision=bool(parsed.get("dental_vision", False)),
        stock_options=bool(parsed.get("stock_options", False)),
        invitations=invitations,
    )


@router.post("/parse-invitations", response_model=ParseInvitationsResponse)
async def parse_invitations(payload: ParseInvitationsRequest) -> ParseInvitationsResponse:
    """Use an LLM to extract name/email pairs from freeform pasted text."""
    if not payload.text or not payload.text.strip():
        return ParseInvitationsResponse(invitations=[])

    provider = get_provider()
    system_prompt = (
        "You are a data extraction assistant. "
        "Extract all name and email address pairs from the text the user provides. "
        "The text may use any delimiter (commas, semicolons, newlines, pipes, spaces) and any format "
        "(e.g. 'John Smith <john@example.com>', 'jane@example.com Jane Doe', plain email lists, etc.). "
        "If a name cannot be determined, infer it from the email local-part as a best guess (capitalised). "
        "Return ONLY valid JSON — no markdown, no explanation — matching this exact schema:\n"
        '{"invitations": [{"name": string, "email": string}, ...]}\n'
        "Omit any entry where the email is not a valid email address format. "
        "Deduplicate by email (case-insensitive)."
    )
    result = await provider.generate(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": payload.text}],
        temperature=0.0,
    )
    raw = _extract_json_object(result.get("content", ""))
    raw_list = raw.get("invitations") or []
    invitations = []
    seen: set[str] = set()
    email_re = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    import re
    for item in raw_list if isinstance(raw_list, list) else []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        email = str(item.get("email") or "").strip().lower()
        if not email or not re.match(email_re, email):
            continue
        if email in seen:
            continue
        seen.add(email)
        invitations.append(ParsedInvitation(name=name or email.split("@")[0].capitalize(), email=email))
    return ParseInvitationsResponse(invitations=invitations)


@router.get("/from-prompt/random", response_model=RandomCasePromptResponse)
async def random_case_prompt() -> RandomCasePromptResponse:
    provider = get_provider()
    system_prompt = (
        "Generate one realistic operator prompt for a salary negotiation case. "
        "Return plain text only, no JSON, no markdown. Keep it 5-8 sentences and include: "
        "job title, location/jurisdiction hint, responsibilities, candidate target package, "
        "candidate constraints, company budget constraints, and at least one tradeoff dimension "
        "(bonus/equity/title/review cycle)."
    )

    result = await provider.generate(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": "Create a varied, realistic negotiation scenario."}],
        temperature=0.8,
    )
    text = str(result.get("content", "")).strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to generate random case prompt")
    return RandomCasePromptResponse(prompt=text)


@router.get("", response_model=list[CaseResponse])
def list_cases(db: Session = Depends(get_db)) -> list[CaseResponse]:
    cases = CaseService(db).list_cases()
    return [_to_case_response(case) for case in cases]


@router.get("/{case_id}", response_model=CaseResponse)
def get_case(case_id: UUID, db: Session = Depends(get_db)) -> CaseResponse:
    case = CaseService(db).get_case(case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return _to_case_response(case)


@router.put("/{case_id}", response_model=CaseResponse)
def update_case(case_id: UUID, payload: CaseUpdateRequest, db: Session = Depends(get_db)) -> CaseResponse:
    service = CaseService(db)
    case = service.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    updated = service.update_case(
        case,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        jurisdiction=payload.jurisdiction,
        currency=payload.currency,
        operator_guidance=payload.operator_guidance,
        candidate_public=payload.candidate.public_payload if payload.candidate else None,
        candidate_confidential=payload.candidate.confidential_payload if payload.candidate else None,
        company_public=payload.company.public_payload if payload.company else None,
        company_confidential=payload.company.confidential_payload if payload.company else None,
    )
    return _to_case_response(updated)


@router.post("/{case_id}/runs", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
async def create_run_for_case(case_id: UUID, payload: RunCreateRequest, db: Session = Depends(get_db)) -> RunResponse:
    case = CaseService(db).get_case(case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    run_config = db.get(RunConfig, payload.run_config_id)
    if run_config is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run config not found")
    if run_config.case_id != case_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Run config does not belong to case")

    prompt_set = db.get(PromptSet, payload.prompt_set_id)
    if prompt_set is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt set not found")

    provider = run_config.config_json.get("provider", "azure_openai")
    model_name = run_config.config_json.get("model_name", "gpt-4.1")
    orchestration_mode = run_config.config_json.get("conversation_mode", "hybrid_guided_groupchat")

    run_service = RunService(db)
    run = run_service.create_run(
        case_id=case_id,
        run_config_id=payload.run_config_id,
        prompt_set_id=payload.prompt_set_id,
        provider=provider,
        model_name=model_name,
        orchestration_mode=orchestration_mode,
    )

    await NegotiationRunner(db).run(run.id)
    refreshed = run_service.get_run(run.id)
    return _to_run_response(refreshed)


@router.get("/{case_id}/runs", response_model=list[RunResponse])
def list_runs_for_case(case_id: UUID, db: Session = Depends(get_db)) -> list[RunResponse]:
    case = CaseService(db).get_case(case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    runs = RunService(db).list_runs_for_case(case_id)
    return [_to_run_response(run) for run in runs]
