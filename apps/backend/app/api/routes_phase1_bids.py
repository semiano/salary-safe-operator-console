from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agent_runtime.providers import get_provider
from app.core.db import get_db
from app.core.security import get_current_user
from app.models.case import Phase1Bid
from app.models.user import User
from app.schemas.phase1_bid import (
    BidStats,
    CaseBidStatsResponse,
    Phase1BidBulkDecisionRequest,
    Phase1BidBulkDecisionResult,
    Phase1BidBulkInviteRequest,
    Phase1BidCreateRequest,
    Phase1BidDecisionUpdateRequest,
    Phase1BidInviteRequest,
    Phase1BidRandomGenerateRequest,
    Phase1BidRandomGenerateResult,
    Phase1BidResponse,
    Phase1BidResponseMessageUpdateRequest,
    Phase1BidSimulateRequest,
    Phase1BidUpdateRequest,
)
from app.services.phase1_bid_service import Phase1BidService

router = APIRouter(tags=["phase1-bids"], dependencies=[Depends(get_current_user)])


def _as_nonempty_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def _as_number(value: Any) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            num = float(stripped)
        except ValueError:
            return None
        if num.is_integer():
            return int(num)
        return num
    return None


def _as_nonempty_str_list(value: Any) -> list[str]:
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            normalized = _as_nonempty_str(item)
            if normalized:
                result.append(normalized)
        return result
    single = _as_nonempty_str(value)
    return [single] if single else []


def _pick_first_str(payload: dict[str, Any], keys: list[str]) -> str | None:
    for key in keys:
        candidate = _as_nonempty_str(payload.get(key))
        if candidate:
            return candidate
    return None


def _pick_first_number(payload: dict[str, Any], keys: list[str]) -> int | float | None:
    for key in keys:
        candidate = _as_number(payload.get(key))
        if candidate is not None:
            return candidate
    return None


def _build_bulk_decision_job_listing_payload(case: Any) -> dict[str, Any]:
    candidate_public: dict[str, Any] = {}
    company_public: dict[str, Any] = {}
    company_confidential: dict[str, Any] = {}

    for party in getattr(case, "parties", []) or []:
        if party.party_type == "candidate":
            candidate_public = party.public_payload or {}
        elif party.party_type == "company":
            company_public = party.public_payload or {}
            company_confidential = party.confidential_payload or {}

    responsibilities = (
        _as_nonempty_str_list(candidate_public.get("responsibilities"))
        + _as_nonempty_str_list(candidate_public.get("key_responsibilities"))
        + _as_nonempty_str_list(company_public.get("responsibilities"))
        + _as_nonempty_str_list(company_public.get("key_responsibilities"))
    )

    benefits = company_confidential.get("benefits")
    normalized_benefits = benefits if isinstance(benefits, dict) else {}

    return {
        "title": case.title,
        "description": case.description,
        "status": case.status,
        "jurisdiction": case.jurisdiction,
        "currency": case.currency,
        "job_title": _pick_first_str(candidate_public, ["job_title", "target_role", "title", "position_title"])
        or _pick_first_str(company_public, ["job_title", "role_title", "title", "position_title", "role_scope"])
        or case.title,
        "job_description": _pick_first_str(candidate_public, ["job_description", "role_description"])
        or _pick_first_str(company_public, ["job_description", "role_description", "budget_context", "role_scope"])
        or case.description,
        "responsibilities": responsibilities,
        "category": _pick_first_str(company_public, ["category", "job_category"]),
        "work_arrangement": _pick_first_str(company_public, ["work_arrangement"]),
        "location": _pick_first_str(company_public, ["location"]),
        "budget_floor": _pick_first_number(company_confidential, ["budget_floor", "salary_floor"]),
        "budget_target": _pick_first_number(company_confidential, ["budget_target", "salary_target"]),
        "budget_ceiling": _pick_first_number(company_confidential, ["budget_ceiling", "salary_ceiling"]),
        "benefits": normalized_benefits,
    }


@router.get("/cases/{case_id}/phase1-bids", response_model=list[Phase1BidResponse])
def list_phase1_bids(case_id: UUID, db: Session = Depends(get_db)) -> list[Phase1BidResponse]:
    service = Phase1BidService(db)
    if service.get_case(case_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return [_to_response(bid) for bid in service.list_for_case(case_id)]


@router.post("/cases/{case_id}/phase1-bids/simulate", response_model=Phase1BidResponse, status_code=status.HTTP_201_CREATED)
def simulate_candidate_bid(case_id: UUID, payload: Phase1BidSimulateRequest, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    if service.get_case(case_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    bid = service.create_simulated_submission(
        case_id=case_id,
        candidate_name=payload.candidate_name,
        candidate_email=str(payload.candidate_email),
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        insurance_importance_rank=payload.insurance_importance_rank,
        pto_importance_rank=payload.pto_importance_rank,
        wfh_importance_rank=payload.wfh_importance_rank,
    )
    return _to_response(bid)


@router.post("/cases/{case_id}/phase1-bids", response_model=Phase1BidResponse, status_code=status.HTTP_201_CREATED)
def create_phase1_bid(case_id: UUID, payload: Phase1BidCreateRequest, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    if service.get_case(case_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    bid = service.create_bid(
        case_id=case_id,
        applicant_identifier=payload.applicant_identifier,
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        insurance_importance_rank=payload.insurance_importance_rank,
        pto_importance_rank=payload.pto_importance_rank,
        wfh_importance_rank=payload.wfh_importance_rank,
    )
    return _to_response(bid)


@router.get("/phase1-bids/{bid_id}", response_model=Phase1BidResponse)
def get_phase1_bid(bid_id: UUID, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    bid = service.get_bid(bid_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase 1 bid not found")
    return _to_response(bid)


@router.put("/phase1-bids/{bid_id}", response_model=Phase1BidResponse)
def update_phase1_bid(
    bid_id: UUID,
    payload: Phase1BidUpdateRequest,
    db: Session = Depends(get_db),
) -> Phase1BidResponse:
    """Admin override: edit candidate-submitted fields on any bid."""
    service = Phase1BidService(db)
    bid = service.get_bid(bid_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase 1 bid not found")
    updated = service.update_bid_fields(
        bid=bid,
        candidate_name=payload.candidate_name,
        candidate_email=str(payload.candidate_email) if payload.candidate_email else None,
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        insurance_importance_rank=payload.insurance_importance_rank,
        pto_importance_rank=payload.pto_importance_rank,
        wfh_importance_rank=payload.wfh_importance_rank,
    )
    return _to_response(updated)


@router.put("/phase1-bids/{bid_id}/decision", response_model=Phase1BidResponse)
def update_phase1_bid_decision(
    bid_id: UUID,
    payload: Phase1BidDecisionUpdateRequest,
    db: Session = Depends(get_db),
) -> Phase1BidResponse:
    service = Phase1BidService(db)
    bid = service.get_bid(bid_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase 1 bid not found")

    updated = service.update_decision(
        bid=bid,
        decision_status=payload.decision_status,
        decision_reason=payload.decision_reason,
        response_message=payload.response_message,
    )
    return _to_response(updated)


@router.put("/phase1-bids/{bid_id}/response-message", response_model=Phase1BidResponse)
def update_phase1_bid_response_message(
    bid_id: UUID,
    payload: Phase1BidResponseMessageUpdateRequest,
    db: Session = Depends(get_db),
) -> Phase1BidResponse:
    service = Phase1BidService(db)
    bid = service.get_bid(bid_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase 1 bid not found")

    updated = service.update_response_message(bid=bid, response_message=payload.response_message)
    return _to_response(updated)


@router.post("/phase1-bids/{bid_id}/send-response", response_model=Phase1BidResponse)
def send_phase1_bid_response(bid_id: UUID, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    bid = service.get_bid(bid_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase 1 bid not found")

    updated = service.send_response(bid)
    return _to_response(updated)


@router.post("/cases/{case_id}/phase1-bids/bulk-llm-decision", response_model=Phase1BidBulkDecisionResult)
async def bulk_decide_phase1_bids(
    case_id: UUID,
    payload: Phase1BidBulkDecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Phase1BidBulkDecisionResult:
    service = Phase1BidService(db)
    case = service.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    open_bids = service.list_open_for_case(case_id)
    if not open_bids:
        return Phase1BidBulkDecisionResult(processed_count=0, skipped_count=0, updated_bid_ids=[])

    case_payload = _build_bulk_decision_job_listing_payload(case)

    bids_payload = [
        {
            "bid_id": str(bid.id),
            "applicant_identifier": bid.applicant_identifier,
            "salary_min": bid.salary_min,
            "salary_max": bid.salary_max,
            "insurance_importance_rank": bid.insurance_importance_rank,
            "pto_importance_rank": bid.pto_importance_rank,
            "wfh_importance_rank": bid.wfh_importance_rank,
        }
        for bid in open_bids
    ]

    system_prompt = (
        "You are evaluating phase 1 applicant bids for a hiring team. "
        "Return JSON only with key decisions. decisions must be an array of objects with keys: "
        "bid_id, decision_status, decision_reason, response_message. "
        "decision_status must be accepted or rejected. "
        "response_message must be professional and concise."
    )
    user_prompt = (
        "Evaluate these phase 1 bids for this job.\n"
        f"Case: {case_payload}\n"
        f"Bids: {bids_payload}\n"
        f"Operator guidance: {payload.operator_guidance or 'none'}\n"
        f"Requested by operator: {current_user.email}"
    )

    provider = get_provider()
    result = await provider.generate(system_prompt=system_prompt, messages=[{"role": "user", "content": user_prompt}], temperature=0.1)
    decisions = service.parse_bulk_decisions_json(str(result.get("content", "")))

    processed_count, updated_ids = service.apply_bulk_decisions(bids=open_bids, decisions_payload=decisions)
    skipped_count = len(open_bids) - processed_count

    return Phase1BidBulkDecisionResult(processed_count=processed_count, skipped_count=skipped_count, updated_bid_ids=updated_ids)


@router.post("/cases/{case_id}/phase1-bids/random-generate", response_model=Phase1BidRandomGenerateResult)
async def random_generate_phase1_bids(
    case_id: UUID,
    payload: Phase1BidRandomGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Phase1BidRandomGenerateResult:
    service = Phase1BidService(db)
    case = service.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    existing_count = len(service.list_for_case(case_id))

    system_prompt = (
        "Generate realistic candidate bid submissions for a hiring portal. "
        "Return JSON only with top-level key bids, where bids is an array of objects. "
        "Each object must include: applicant_identifier (email matching candidate_email), "
        "candidate_name (realistic first and last name), candidate_email (realistic email matching the name, e.g. first.last@example.com), "
        "salary_min, salary_max, insurance_importance_rank, pto_importance_rank, wfh_importance_rank. "
        "Ranks are integers 1 to 3 where 1=low priority, 2=medium, 3=high priority. salary_min > 0, salary_max >= salary_min."
    )
    user_prompt = (
        f"Create {payload.count} fresh phase 1 bids for this job.\n"
        f"Case title: {case.title}\n"
        f"Case description: {case.description}\n"
        f"Case currency: {case.currency}\n"
        f"Existing bid count: {existing_count}\n"
        f"Additional guidance: {payload.additional_guidance or 'none'}\n"
        f"Requested by: {current_user.email}"
    )

    provider = get_provider()
    result = await provider.generate(system_prompt=system_prompt, messages=[{"role": "user", "content": user_prompt}], temperature=0.8)
    parsed_bids = service.parse_generated_bids_json(str(result.get("content", "")))

    if not parsed_bids:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="LLM failed to generate valid phase 1 bid records")

    created = service.create_generated_bids(case_id=case_id, bid_payloads=parsed_bids[: payload.count])
    return Phase1BidRandomGenerateResult(created_count=len(created), created_bid_ids=[bid.id for bid in created])


@router.post("/cases/{case_id}/phase1-bids/random-invite", response_model=Phase1BidResponse, status_code=status.HTTP_201_CREATED)
async def random_invite_phase1_bid(
    case_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Phase1BidResponse:
    """Generate a random candidate identity via LLM and create an invitation-pending bid."""
    service = Phase1BidService(db)
    case = service.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    system_prompt = (
        "Generate a realistic fake job candidate identity. "
        "Return JSON only with keys: candidate_name (realistic first + last name) "
        "and candidate_email (email derived from the name, e.g. first.last@somecompany.com — use varied realistic domains)."
    )
    user_prompt = (
        f"Create one realistic fake candidate for this role: {case.title}.\n"
        f"Requested by: {current_user.email}"
    )

    provider = get_provider()
    result = await provider.generate(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=0.9,
    )

    import json as _json
    content = str(result.get("content", ""))
    candidate_name: str | None = None
    candidate_email: str | None = None
    try:
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end > start:
            parsed = _json.loads(content[start : end + 1])
            candidate_name = str(parsed.get("candidate_name", "")).strip() or None
            candidate_email = str(parsed.get("candidate_email", "")).strip() or None
    except Exception:
        pass

    if not candidate_email:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="LLM failed to generate a candidate identity")

    bid = service.create_invitation(
        case_id=case_id,
        candidate_email=candidate_email,
        candidate_name=candidate_name,
    )
    return _to_response(bid)


@router.post("/cases/{case_id}/phase1-bids/invite", response_model=list[Phase1BidResponse], status_code=status.HTTP_201_CREATED)
def create_bid_invitations(case_id: UUID, payload: Phase1BidBulkInviteRequest, db: Session = Depends(get_db)) -> list[Phase1BidResponse]:
    service = Phase1BidService(db)
    if service.get_case(case_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    created = [
        service.create_invitation(
            case_id=case_id,
            candidate_email=str(inv.candidate_email),
            candidate_name=inv.candidate_name,
        )
        for inv in payload.invitations
    ]
    return [_to_response(bid) for bid in created]


@router.post("/phase1-bids/{bid_id}/resend-invitation", response_model=Phase1BidResponse)
def resend_bid_invitation(bid_id: UUID, db: Session = Depends(get_db)) -> Phase1BidResponse:
    """Regenerate the invitation code for a pending invitation bid."""
    service = Phase1BidService(db)
    bid = service.get_bid(bid_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase 1 bid not found")
    if not bid.is_invitation:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only invitation bids can be resent")
    updated = service.resend_invitation(bid=bid)
    return _to_response(updated)


@router.delete("/phase1-bids/{bid_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_bid(bid_id: UUID, db: Session = Depends(get_db)) -> None:
    """Permanently delete a bid / invitation."""
    service = Phase1BidService(db)
    bid = service.get_bid(bid_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phase 1 bid not found")
    service.revoke_bid(bid=bid)


@router.get("/cases/{case_id}/bid-stats", response_model=BidStats)
def get_case_bid_stats(case_id: UUID, db: Session = Depends(get_db)) -> BidStats:
    service = Phase1BidService(db)
    if service.get_case(case_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    result = service.get_bid_stats_for_cases([case_id])
    entry = result.get(str(case_id), {"invitations_sent": 0, "bids_received": 0})
    return BidStats(invitations_sent=entry["invitations_sent"], bids_received=entry["bids_received"])


def _to_response(bid: Phase1Bid) -> Phase1BidResponse:
    return Phase1BidResponse(
        id=bid.id,
        case_id=bid.case_id,
        token=bid.token,
        applicant_identifier=bid.applicant_identifier,
        candidate_email=bid.candidate_email,
        candidate_name=bid.candidate_name,
        is_invitation=bid.is_invitation,
        invitation_code=bid.invitation_code,
        salary_min=float(bid.salary_min),
        salary_max=float(bid.salary_max),
        insurance_importance_rank=bid.insurance_importance_rank,
        pto_importance_rank=bid.pto_importance_rank,
        wfh_importance_rank=bid.wfh_importance_rank,
        submission_status=bid.submission_status,
        decision_status=bid.decision_status,
        decision_reason=bid.decision_reason,
        response_message=bid.response_message,
        received_at=bid.received_at,
        sent_at=bid.sent_at,
        candidate_submitted_at=bid.candidate_submitted_at,
        created_at=bid.created_at,
        updated_at=bid.updated_at,
    )
