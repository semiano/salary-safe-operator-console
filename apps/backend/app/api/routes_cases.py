import json
from uuid import UUID

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
    RandomCasePromptResponse,
)
from app.schemas.run import RunCreateRequest, RunResponse
from app.agent_runtime.providers import get_provider
from app.services.case_service import CaseService
from app.services.run_service import RunService
from app.workers.negotiation_runner import NegotiationRunner

router = APIRouter(prefix="/cases", tags=["cases"], dependencies=[Depends(get_current_user)])


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
