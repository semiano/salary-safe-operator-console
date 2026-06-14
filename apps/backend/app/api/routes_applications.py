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
    Phase1BidBulkNudgeRequest,
    Phase1BidBulkNudgeResult,
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
from app.services.mail_service import send_bid_invitation_reminder, send_bid_response
from app.services.phase1_bid_service import Phase1BidService
from app.services.config_service import ConfigService

router = APIRouter(tags=["applications"], dependencies=[Depends(get_current_user)])


def _should_auto_send_response(*, decision_status: str, match_score: float | None, threshold: float) -> bool:
    if decision_status != "accepted":
        return False
    if match_score is None:
        return False
    return match_score >= threshold


def _send_response_with_email(service: Phase1BidService, bid: Phase1Bid) -> Phase1Bid:
    updated = service.send_response(bid)
    if not updated.candidate_email:
        return updated

    case = service.get_case(updated.case_id)
    role_title = case.title if case else "the role"
    subject = f"Update on your bid for {role_title}"
    try:
        send_bid_response(
            candidate_name=updated.candidate_name or "",
            candidate_email=updated.candidate_email,
            role_title=role_title,
            decision=updated.decision_status or "pending",
            response_message=updated.response_message,
        )
        service.log_message_event(
            bid=updated,
            event_type="email_delivery",
            title="Response email delivered",
            detail="Final response email was sent to the candidate.",
            payload={"channel": "email", "status": "sent", "subject": subject},
        )
    except Exception:  # noqa: BLE001
        service.log_message_event(
            bid=updated,
            event_type="email_delivery",
            title="Response email failed",
            detail="Final response email failed to send.",
            payload={"channel": "email", "status": "failed", "subject": subject},
        )
    return updated


# ── Shared response helper ────────────────────────────────────────────────────

def _to_response(bid: Phase1Bid, *, last_status_change_at=None) -> Phase1BidResponse:
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
        match_score=bid.match_score,
        decision_reason=bid.decision_reason,
        response_message=bid.response_message,
        received_at=bid.received_at,
        sent_at=bid.sent_at,
        candidate_submitted_at=bid.candidate_submitted_at,
        created_at=bid.created_at,
        updated_at=bid.updated_at,
        last_status_change_at=last_status_change_at,
        job_title=bid.case.title if bid.case else None,
        job_posted_at=bid.case.created_at if bid.case else None,
    )


# ── Per-listing application endpoints ────────────────────────────────────────

@router.get("/job-listings/{listing_id}/applications", response_model=list[Phase1BidResponse])
def list_applications(listing_id: UUID, db: Session = Depends(get_db)) -> list[Phase1BidResponse]:
    service = Phase1BidService(db)
    if service.get_case(listing_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    bids = service.list_for_case(listing_id)
    last_status_change_by_bid = service.get_last_status_change_map([b.id for b in bids])
    return [_to_response(b, last_status_change_at=last_status_change_by_bid.get(b.id)) for b in bids]


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
        "bid_id, match_score, decision_status (accepted|rejected), decision_reason, response_message. "
        "match_score must be a number from 0 to 100, where higher means stronger match. "
        "Do not reject candidates simply for having a target salary or for being below target. "
        "Use affordability logic to filter out candidates who are too high on total compensation and benefits."
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
    threshold = ConfigService(db).get_auto_accept_match_threshold()
    for updated_id in updated_ids:
        updated_bid = service.get_bid(updated_id)
        if updated_bid is None or updated_bid.submission_status != "applicant_bid_submitted":
            continue
        if _should_auto_send_response(
            decision_status=updated_bid.decision_status,
            match_score=updated_bid.match_score,
            threshold=threshold,
        ):
            _send_response_with_email(service, updated_bid)

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
    bids = service.list_all()
    last_status_change_by_bid = service.get_last_status_change_map([b.id for b in bids])
    return [_to_response(b, last_status_change_at=last_status_change_by_bid.get(b.id)) for b in bids]


@router.post("/applications/nudge-awaiting", response_model=Phase1BidBulkNudgeResult)
def nudge_awaiting_applications(
    payload: Phase1BidBulkNudgeRequest,
    db: Session = Depends(get_db),
) -> Phase1BidBulkNudgeResult:
    service = Phase1BidService(db)
    nudged_ids: list[UUID] = []
    skipped_count = 0

    for application_id in payload.application_ids:
        bid = service.get_bid(application_id)
        if bid is None or bid.submission_status != "invitation_pending" or not bid.candidate_email or not bid.invitation_code:
            skipped_count += 1
            continue

        case = service.get_case(bid.case_id)
        role_title = case.title if case else "the role"
        apply_url = f"http://159.65.237.234/apply/{bid.invitation_code}"
        try:
            send_bid_invitation_reminder(
                candidate_name=bid.candidate_name or "",
                candidate_email=bid.candidate_email,
                role_title=role_title,
                apply_url=apply_url,
            )
            service.log_message_event(
                bid=bid,
                event_type="invitation_nudged",
                title="Reminder sent",
                detail="Candidate was nudged to respond to the invitation.",
                payload={"channel": "email", "status": "sent", "subject": f"Reminder: submit your salary bid for {role_title}"},
            )
            nudged_ids.append(bid.id)
        except Exception:  # noqa: BLE001
            service.log_message_event(
                bid=bid,
                event_type="invitation_nudged",
                title="Reminder failed",
                detail="Candidate reminder email failed to send.",
                payload={"channel": "email", "status": "failed", "subject": f"Reminder: submit your salary bid for {role_title}"},
            )
            skipped_count += 1

    return Phase1BidBulkNudgeResult(
        requested_count=len(payload.application_ids),
        nudged_count=len(nudged_ids),
        skipped_count=skipped_count,
        nudged_application_ids=nudged_ids,
    )


@router.get("/applications/{application_id}", response_model=Phase1BidResponse)
def get_application(application_id: UUID, db: Session = Depends(get_db)) -> Phase1BidResponse:
    service = Phase1BidService(db)
    bid = service.get_bid(application_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    last_status_change_by_bid = service.get_last_status_change_map([bid.id])
    return _to_response(bid, last_status_change_at=last_status_change_by_bid.get(bid.id))


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
        match_score=None,
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


@router.post("/applications/{application_id}/ai-auto-respond", response_model=Phase1BidResponse)
async def ai_auto_respond_application(
    application_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Phase1BidResponse:
    """Global-admin only: use AI to simulate the candidate filling in their bid values,
    then immediately run AI match so the bid is fully evaluated in one click."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")

    service = Phase1BidService(db)
    bid = service.get_bid(application_id)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    if bid.submission_status != "invitation_pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="AI auto-respond only works on invitation_pending bids",
        )

    case = service.get_case(bid.case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated job listing not found")

    import json as _json

    # Step 1: generate realistic candidate bid values
    gen_system = (
        "You are generating a realistic candidate bid response for a hiring portal. "
        "Return JSON only with keys: salary_min (number), salary_max (number, >= salary_min), "
        "insurance_importance_rank (1-3), pto_importance_rank (1-3), wfh_importance_rank (1-3). "
        "Make the values realistic for the role and market."
    )
    gen_user = (
        f"Generate candidate bid values for role: {case.title}\n"
        f"Currency: {case.currency}\n"
        f"Candidate: {bid.candidate_name or bid.candidate_email or 'unknown'}\n"
        f"Requested by: {current_user.email}"
    )

    provider = get_provider()
    gen_result = await provider.generate(
        system_prompt=gen_system,
        messages=[{"role": "user", "content": gen_user}],
        temperature=0.7,
    )

    gen_content = str(gen_result.get("content", ""))
    salary_min: float = 70000.0
    salary_max: float = 90000.0
    insurance_rank: int = 2
    pto_rank: int = 2
    wfh_rank: int = 2
    try:
        gs = gen_content.find("{")
        ge = gen_content.rfind("}")
        if gs != -1 and ge > gs:
            gp = _json.loads(gen_content[gs : ge + 1])
            salary_min = float(gp.get("salary_min", salary_min))
            salary_max = max(float(gp.get("salary_max", salary_max)), salary_min)
            insurance_rank = int(gp.get("insurance_importance_rank", insurance_rank))
            pto_rank = int(gp.get("pto_importance_rank", pto_rank))
            wfh_rank = int(gp.get("wfh_importance_rank", wfh_rank))
    except Exception:
        pass

    # Step 2: stamp bid as submitted with the generated values
    service.update_bid_fields(
        bid=bid,
        candidate_name=bid.candidate_name,
        candidate_email=bid.candidate_email,
        salary_min=salary_min,
        salary_max=salary_max,
        insurance_importance_rank=max(1, min(3, insurance_rank)),
        pto_importance_rank=max(1, min(3, pto_rank)),
        wfh_importance_rank=max(1, min(3, wfh_rank)),
    )

    # Step 3: immediately run AI match decision
    match_system = (
        "You are evaluating a single phase 1 applicant bid for a hiring team. "
        "Return JSON only with keys: match_score (0-100 number), decision_status ('accepted' or 'rejected'), "
        "decision_reason (one concise sentence), "
        "response_message (professional message to send the candidate). "
        "Do not reject candidates simply for having a target salary or for being below target. "
        "Use affordability logic to filter out candidates who are too high on total compensation and benefits."
    )
    match_user = (
        f"Evaluate this bid for role: {case.title}\n"
        f"Operator guidance: {case.operator_guidance}\n"
        f"Candidate salary range: {salary_min}–{salary_max} {case.currency}\n"
        f"Insurance rank: {insurance_rank}/3, PTO rank: {pto_rank}/3, WFH rank: {wfh_rank}/3"
    )

    match_result = await provider.generate(
        system_prompt=match_system,
        messages=[{"role": "user", "content": match_user}],
        temperature=0.1,
    )

    match_content = str(match_result.get("content", ""))
    decision = "pending"
    match_score: float | None = None
    decision_reason: str | None = None
    response_message: str | None = None
    try:
        ms = match_content.find("{")
        me = match_content.rfind("}")
        if ms != -1 and me > ms:
            mp = _json.loads(match_content[ms : me + 1])
            d = str(mp.get("decision_status", "")).strip().lower()
            if d in {"accepted", "rejected"}:
                decision = d
            try:
                match_score = float(mp.get("match_score"))
            except (TypeError, ValueError):
                match_score = None
            decision_reason = str(mp.get("decision_reason", "")).strip() or None
            response_message = str(mp.get("response_message", "")).strip() or None
    except Exception:
        pass

    if decision in {"accepted", "rejected"}:
        bid = service.update_decision(
            bid=bid,
            decision_status=decision,
            match_score=match_score,
            decision_reason=decision_reason,
            response_message=response_message,
        )

        threshold = ConfigService(db).get_auto_accept_match_threshold()
        if (
            bid.submission_status == "applicant_bid_submitted"
            and _should_auto_send_response(
                decision_status=bid.decision_status,
                match_score=bid.match_score,
                threshold=threshold,
            )
        ):
            bid = _send_response_with_email(service, bid)

    return _to_response(bid)
