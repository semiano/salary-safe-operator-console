"""Applications API — new-taxonomy routes for /api/job-listings/{id}/applications
and /api/applications/{id}.  Old /api/phase1-bids/... remain for Under-Construction pages.
"""

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
    Phase1BidBulkDecisionRequest,
    Phase1BidBulkDecisionResult,
    Phase1BidBulkInviteRequest,
    Phase1BidCreateRequest,
    Phase1BidDecisionUpdateRequest,
    Phase1BidRandomGenerateRequest,
    Phase1BidRandomGenerateResult,
    Phase1BidResponse,
    Phase1BidResponseMessageUpdateRequest,
    Phase1BidSimulateRequest,
    Phase1BidUpdateRequest,
)
from app.services.phase1_bid_service import Phase1BidService

router = APIRouter(tags=["applications"], dependencies=[Depends(get_current_user)])


# ── Shared response helper ────────────────────────────────────────────────────

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


# ── Per-listing application endpoints ────────────────────────────────────────

@router.get("/job-listings/{listing_id}/applications", response_model=list[Phase1BidResponse])
def list_applications(listing_id: UUID, db: Session = Depends(get_db)) -> list[Phase1BidResponse]:
    service = Phase1BidService(db)
    if service.get_case(listing_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    return [_to_response(b) for b in service.list_for_case(listing_id)]


@router.post("/job-listings/{listing_id}/applications", response_model=Phase1BidResponse, status_code=status.HTTP_201_CREATED)
def create_application(listing_id: UUID, payload: Phase1BidCreateRequest, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    if service.get_case(listing_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    bid = service.create_bid(
        case_id=listing_id,
        applicant_identifier=payload.applicant_identifier,
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        insurance_importance_rank=payload.insurance_importance_rank,
        pto_importance_rank=payload.pto_importance_rank,
        wfh_importance_rank=payload.wfh_importance_rank,
    )
    return _to_response(bid)


@router.post("/job-listings/{listing_id}/applications/simulate", response_model=Phase1BidResponse, status_code=status.HTTP_201_CREATED)
def simulate_application(listing_id: UUID, payload: Phase1BidSimulateRequest, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    if service.get_case(listing_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    bid = service.create_simulated_submission(
        case_id=listing_id,
        candidate_name=payload.candidate_name,
        candidate_email=str(payload.candidate_email),
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        insurance_importance_rank=payload.insurance_importance_rank,
        pto_importance_rank=payload.pto_importance_rank,
        wfh_importance_rank=payload.wfh_importance_rank,
    )
    return _to_response(bid)


@router.post("/job-listings/{listing_id}/applications/invite", response_model=list[Phase1BidResponse], status_code=status.HTTP_201_CREATED)
def invite_candidates(listing_id: UUID, payload: Phase1BidBulkInviteRequest, db: Session = Depends(get_db)) -> list[Phase1BidResponse]:
    service = Phase1BidService(db)
    if service.get_case(listing_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    created = [
        service.create_invitation(
            case_id=listing_id,
            candidate_email=str(inv.candidate_email),
            candidate_name=inv.candidate_name,
        )
        for inv in payload.invitations
    ]
    return [_to_response(b) for b in created]


@router.post("/job-listings/{listing_id}/applications/random-invite", response_model=Phase1BidResponse, status_code=status.HTTP_201_CREATED)
async def random_invite_candidate(
    listing_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Phase1BidResponse:
    service = Phase1BidService(db)
    case = service.get_case(listing_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    system_prompt = (
        "Generate a realistic fake job candidate identity. "
        'Return JSON only: {"candidate_name": str, "candidate_email": str}.'
    )
    provider = get_provider()
    result = await provider.generate(
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": f"Create one fake candidate for: {case.title}"}],
        temperature=0.9,
    )
    import json as _json
    content = str(result.get("content", ""))
    candidate_name: str | None = None
    candidate_email: str | None = None
    try:
        s, e = content.find("{"), content.rfind("}")
        if s != -1 and e > s:
            parsed = _json.loads(content[s : e + 1])
            candidate_name = str(parsed.get("candidate_name", "")).strip() or None
            candidate_email = str(parsed.get("candidate_email", "")).strip() or None
    except Exception:
        pass
    if not candidate_email:
        raise HTTPException(status_code=502, detail="LLM failed to generate a candidate identity")
    bid = service.create_invitation(case_id=listing_id, candidate_email=candidate_email, candidate_name=candidate_name)
    return _to_response(bid)


@router.post("/job-listings/{listing_id}/applications/bulk-llm-decision", response_model=Phase1BidBulkDecisionResult)
async def bulk_decide_applications(
    listing_id: UUID,
    payload: Phase1BidBulkDecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Phase1BidBulkDecisionResult:
    service = Phase1BidService(db)
    case = service.get_case(listing_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    open_bids = service.list_open_for_case(listing_id)
    if not open_bids:
        return Phase1BidBulkDecisionResult(processed_count=0, skipped_count=0, updated_bid_ids=[])

    bids_payload = [
        {
            "bid_id": str(b.id),
            "applicant_identifier": b.applicant_identifier,
            "salary_min": b.salary_min,
            "salary_max": b.salary_max,
            "insurance_importance_rank": b.insurance_importance_rank,
            "pto_importance_rank": b.pto_importance_rank,
            "wfh_importance_rank": b.wfh_importance_rank,
        }
        for b in open_bids
    ]
    system_prompt = (
        "You are evaluating phase 1 applicant bids for a hiring team. "
        "Return JSON only. decisions must be an array of objects with keys: "
        "bid_id, decision_status (accepted|rejected), decision_reason, response_message."
    )
    user_prompt = (
        f"Case: {case.title}\nBids: {bids_payload}\n"
        f"Operator guidance: {payload.operator_guidance or 'none'}\n"
        f"Requested by: {current_user.email}"
    )
    provider = get_provider()
    result = await provider.generate(system_prompt=system_prompt, messages=[{"role": "user", "content": user_prompt}], temperature=0.1)
    decisions = service.parse_bulk_decisions_json(str(result.get("content", "")))
    processed_count, updated_ids = service.apply_bulk_decisions(bids=open_bids, decisions_payload=decisions)
    return Phase1BidBulkDecisionResult(
        processed_count=processed_count,
        skipped_count=len(open_bids) - processed_count,
        updated_bid_ids=updated_ids,
    )


@router.post("/job-listings/{listing_id}/applications/random-generate", response_model=Phase1BidRandomGenerateResult)
async def random_generate_applications(
    listing_id: UUID,
    payload: Phase1BidRandomGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Phase1BidRandomGenerateResult:
    service = Phase1BidService(db)
    case = service.get_case(listing_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    existing_count = len(service.list_for_case(listing_id))
    system_prompt = (
        "Generate realistic candidate bid submissions. "
        "Return JSON only with top-level key bids, where bids is an array. "
        "Each object: applicant_identifier (email), candidate_name, candidate_email, "
        "salary_min, salary_max, insurance_importance_rank, pto_importance_rank, wfh_importance_rank (1-3)."
    )
    user_prompt = (
        f"Create {payload.count} fresh applications for: {case.title}\n"
        f"Currency: {case.currency}, Existing: {existing_count}\n"
        f"Guidance: {payload.additional_guidance or 'none'}"
    )
    provider = get_provider()
    result = await provider.generate(system_prompt=system_prompt, messages=[{"role": "user", "content": user_prompt}], temperature=0.8)
    parsed_bids = service.parse_generated_bids_json(str(result.get("content", "")))
    if not parsed_bids:
        raise HTTPException(status_code=502, detail="LLM failed to generate valid application records")
    created = service.create_generated_bids(case_id=listing_id, bid_payloads=parsed_bids[: payload.count])
    return Phase1BidRandomGenerateResult(created_count=len(created), created_bid_ids=[b.id for b in created])


@router.get("/job-listings/{listing_id}/bid-stats", response_model=BidStats)
def get_listing_bid_stats(listing_id: UUID, db: Session = Depends(get_db)) -> BidStats:
    service = Phase1BidService(db)
    if service.get_case(listing_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    result = service.get_bid_stats_for_cases([listing_id])
    entry = result.get(str(listing_id), {"invitations_sent": 0, "bids_received": 0})
    return BidStats(invitations_sent=entry["invitations_sent"], bids_received=entry["bids_received"])


# ── Individual application endpoints ─────────────────────────────────────────

@router.get("/applications", response_model=list[Phase1BidResponse])
def list_all_applications(db: Session = Depends(get_db)) -> list[Phase1BidResponse]:
    service = Phase1BidService(db)
    return [_to_response(b) for b in service.list_all()]


@router.get("/applications/{application_id}", response_model=Phase1BidResponse)
def get_application(application_id: UUID, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    bid = service.get_bid(application_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return _to_response(bid)


@router.put("/applications/{application_id}", response_model=Phase1BidResponse)
def update_application(application_id: UUID, payload: Phase1BidUpdateRequest, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    bid = service.get_bid(application_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
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


@router.put("/applications/{application_id}/decision", response_model=Phase1BidResponse)
def update_application_decision(application_id: UUID, payload: Phase1BidDecisionUpdateRequest, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    bid = service.get_bid(application_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    updated = service.update_decision(
        bid=bid,
        decision_status=payload.decision_status,
        decision_reason=payload.decision_reason,
        response_message=payload.response_message,
    )
    return _to_response(updated)


@router.put("/applications/{application_id}/response-message", response_model=Phase1BidResponse)
def update_application_response_message(application_id: UUID, payload: Phase1BidResponseMessageUpdateRequest, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    bid = service.get_bid(application_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    updated = service.update_response_message(bid=bid, response_message=payload.response_message)
    return _to_response(updated)


@router.post("/applications/{application_id}/send-response", response_model=Phase1BidResponse)
def send_application_response(application_id: UUID, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    bid = service.get_bid(application_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    updated = service.send_response(bid)
    return _to_response(updated)
