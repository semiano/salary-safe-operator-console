"""Job Listings API — new-taxonomy routes for /api/job-listings/...
Mirrors routes_cases.py at the new URL prefix.  Old /api/cases/... remain for
Under-Construction pages.
"""

import json
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agent_runtime.providers import get_provider
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
from app.services.case_service import CaseService
from app.services.run_service import RunService
from app.workers.negotiation_runner import NegotiationRunner

router = APIRouter(prefix="/job-listings", tags=["job-listings"], dependencies=[Depends(get_current_user)])


# ── Shared helpers ────────────────────────────────────────────────────────────

def _to_response(case: NegotiationCase) -> CaseResponse:
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
                id=p.id,
                case_id=p.case_id,
                party_type=p.party_type,
                public_payload=p.public_payload,
                confidential_payload=p.confidential_payload,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
            for p in case.parties
        ],
    )


def _extract_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1 or s >= e:
        raise HTTPException(status_code=422, detail="Model output is not valid JSON")
    try:
        return json.loads(text[s : e + 1])
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse JSON: {exc.msg}")


# ── Collection / creation ─────────────────────────────────────────────────────

@router.get("", response_model=list[CaseResponse])
def list_job_listings(db: Session = Depends(get_db)) -> list[CaseResponse]:
    return [_to_response(c) for c in CaseService(db).list_cases()]


@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
def create_job_listing(
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
    return _to_response(case)


# ── Prompt helpers (used by PostRolePage / NewJobListingPage) ─────────────────

@router.get("/from-prompt/random", response_model=RandomCasePromptResponse)
async def random_listing_prompt() -> RandomCasePromptResponse:
    provider = get_provider()
    system_prompt = (
        "Generate one realistic operator prompt for a salary negotiation case. "
        "Return plain text only, no JSON, no markdown. Keep it 5-8 sentences."
    )
    result = await provider.generate(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": "Create a varied, realistic negotiation scenario."}],
        temperature=0.8,
    )
    text = str(result.get("content", "")).strip()
    if not text:
        raise HTTPException(status_code=502, detail="Failed to generate random listing prompt")
    return RandomCasePromptResponse(prompt=text)


@router.post("/from-prompt/preview", response_model=CaseCreateRequest)
async def preview_listing_from_prompt(payload: CaseCreateFromPromptRequest) -> CaseCreateRequest:
    generated = await _generate_listing_payload(payload)
    return CaseCreateRequest(**generated)


@router.post("/from-prompt", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_listing_from_prompt(
    payload: CaseCreateFromPromptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseResponse:
    generated = await _generate_listing_payload(payload)
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
    return _to_response(case)


@router.post("/autofill-role", response_model=RoleAutofillResponse)
async def autofill_listing() -> RoleAutofillResponse:
    provider = get_provider()
    system_prompt = (
        "You are a hiring data generator for SalarySafe. "
        "Return ONLY valid JSON matching this schema exactly:\n"
        '{"job_title":str,"category":str,"work_arrangement":"remote"|"hybrid"|"onsite",'
        '"location":str,"job_description":str,"responsibilities":[str],"currency":"USD"|"GBP"|"EUR"|"CAD"|"AUD",'
        '"budget_floor":int,"budget_ceiling":int,"pto_days":int,"wfh_days_per_week":int,'
        '"health_insurance":bool,"retirement_401k":bool,"dental_vision":bool,"stock_options":bool,'
        '"invitations":[{"name":str,"email":str}]}'
    )
    result = await provider.generate(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": "Generate a varied, realistic job listing."}],
        temperature=0.85,
    )
    p = _extract_json(result.get("content", ""))

    def _int(v: object, default: int) -> int:
        try:
            return int(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return default

    floor = _int(p.get("budget_floor"), 80_000)
    ceiling = _int(p.get("budget_ceiling"), 120_000)
    if ceiling <= floor:
        ceiling = floor + 20_000
    arrangement = str(p.get("work_arrangement") or "hybrid")
    if arrangement not in {"remote", "hybrid", "onsite"}:
        arrangement = "hybrid"
    currency = str(p.get("currency") or "USD").upper()
    if currency not in {"USD", "GBP", "EUR", "CAD", "AUD"}:
        currency = "USD"
    invites_raw = p.get("invitations") or []
    invitations = [
        {"name": str(inv.get("name", "")).strip(), "email": str(inv.get("email", "")).strip()}
        for inv in (invites_raw if isinstance(invites_raw, list) else [])
        if isinstance(inv, dict) and inv.get("name") and inv.get("email")
    ]
    return RoleAutofillResponse(
        job_title=str(p.get("job_title") or "Software Engineer").strip(),
        category=str(p.get("category") or "Engineering").strip(),
        work_arrangement=arrangement,
        location=str(p.get("location") or "Remote").strip(),
        job_description=str(p.get("job_description") or "").strip(),
        responsibilities=[str(r) for r in (p.get("responsibilities") or []) if r],
        currency=currency,
        budget_floor=floor,
        budget_ceiling=ceiling,
        pto_days=max(0, min(365, _int(p.get("pto_days"), 15))),
        wfh_days_per_week=max(0, min(5, _int(p.get("wfh_days_per_week"), 2))),
        health_insurance=bool(p.get("health_insurance", True)),
        retirement_401k=bool(p.get("retirement_401k", True)),
        dental_vision=bool(p.get("dental_vision", False)),
        stock_options=bool(p.get("stock_options", False)),
        invitations=invitations,
    )


@router.post("/parse-invitations", response_model=ParseInvitationsResponse)
async def parse_listing_invitations(payload: ParseInvitationsRequest) -> ParseInvitationsResponse:
    if not payload.text.strip():
        return ParseInvitationsResponse(invitations=[])
    provider = get_provider()
    system_prompt = (
        "Extract all name/email pairs from the user's text. "
        'Return ONLY JSON: {"invitations":[{"name":str,"email":str}]}. '
        "Omit invalid emails. Deduplicate by email."
    )
    result = await provider.generate(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": payload.text}],
        temperature=0.0,
    )
    raw = _extract_json(result.get("content", ""))
    raw_list = raw.get("invitations") or []
    email_re = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    seen: set[str] = set()
    invitations = []
    for item in (raw_list if isinstance(raw_list, list) else []):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        email = str(item.get("email") or "").strip().lower()
        if not email or not re.match(email_re, email) or email in seen:
            continue
        seen.add(email)
        invitations.append(ParsedInvitation(name=name or email.split("@")[0].capitalize(), email=email))
    return ParseInvitationsResponse(invitations=invitations)


# ── Single resource CRUD ──────────────────────────────────────────────────────

@router.get("/{listing_id}", response_model=CaseResponse)
def get_job_listing(listing_id: UUID, db: Session = Depends(get_db)) -> CaseResponse:
    case = CaseService(db).get_case(listing_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    return _to_response(case)


@router.put("/{listing_id}", response_model=CaseResponse)
def update_job_listing(listing_id: UUID, payload: CaseUpdateRequest, db: Session = Depends(get_db)) -> CaseResponse:
    service = CaseService(db)
    case = service.get_case(listing_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
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
    return _to_response(updated)


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _generate_listing_payload(payload: CaseCreateFromPromptRequest) -> dict:
    provider = get_provider()
    system_prompt = (
        "You are a case-construction assistant for salary negotiation. "
        "Return only a JSON object with keys: title, description, status, jurisdiction, currency, "
        "candidate_public, candidate_confidential, company_public, company_confidential."
    )
    user_prompt = f"Jurisdiction hint: {payload.jurisdiction or 'US'}\nCurrency: {payload.currency}\n{payload.prompt}"
    result = await provider.generate(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=0.1,
    )
    parsed = _extract_json(result.get("content", ""))
    for key in ("candidate_public", "candidate_confidential", "company_public", "company_confidential"):
        if not isinstance(parsed.get(key), dict):
            parsed[key] = {}
    return {
        "title": str(parsed.get("title") or "Generated listing").strip(),
        "description": parsed.get("description"),
        "status": str(parsed.get("status") or "draft").strip() or "draft",
        "jurisdiction": str(parsed.get("jurisdiction") or payload.jurisdiction or "US").strip(),
        "currency": str(parsed.get("currency") or payload.currency or "USD").strip().upper(),
        "candidate": {
            "public_payload": parsed["candidate_public"],
            "confidential_payload": parsed["candidate_confidential"],
        },
        "company": {
            "public_payload": parsed["company_public"],
            "confidential_payload": parsed["company_confidential"],
        },
    }
