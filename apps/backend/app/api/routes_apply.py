"""Public (unauthenticated) /apply/{token} endpoints — new-taxonomy mirror of /bid/{token}.

Adds an invitation-code gate:
  GET  /apply/{token}             → job info + requires_code flag
  POST /apply/{token}/verify-code → validate code, 200 or 403
  POST /apply/{token}/submit      → submit, checks code if required
"""

from uuid import UUID

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agent_runtime.providers import get_provider
from app.core.db import SessionLocal, get_db
from app.schemas.phase1_bid import (
    CandidateBidSubmitRequest,
    CandidateBidSubmitResponse,
    PublicApplyStatusResponse,
    PublicBidLookupResponse,
    VerifyCodeRequest,
    VerifyCodeResponse,
)
from app.services.phase1_bid_service import (
    DECISION_ACCEPTED,
    DECISION_PENDING,
    DECISION_REJECTED,
    SUBMISSION_STATUS_INVITATION_PENDING,
    SUBMISSION_STATUS_SUBMITTED,
    SUBMISSION_STATUS_SENT,
    Phase1BidService,
)
from app.services.config_service import ConfigService
from app.services.mail_service import send_bid_response

logger = logging.getLogger(__name__)

router = APIRouter(tags=["apply"])


def _should_auto_send_response(*, decision_status: str, match_score: float | None, threshold: float) -> bool:
    if decision_status != DECISION_ACCEPTED:
        return False
    if match_score is None:
        return False
    return match_score >= threshold


def _resolve_response_message(service: Phase1BidService, bid) -> str:
    message = (bid.response_message or "").strip()
    if message:
        return message
    return service.default_response_message(bid, bid.decision_status or "pending", bid.decision_reason)


def _dispatch_decision(service: Phase1BidService, bid):
    """Send the candidate's decision email and only mark the bid as response_sent
    once delivery is confirmed and logged. Returns the (possibly unchanged) bid."""
    if bid.decision_status not in {DECISION_ACCEPTED, DECISION_REJECTED}:
        return bid
    if not bid.candidate_email:
        # Without an email target we cannot satisfy the "decision shows only if a
        # real message was dispatched" rule, so leave the bid open.
        return bid

    case = service.get_case(bid.case_id)
    role_title = case.title if case else "the role"
    subject = f"Update on your bid for {role_title}"
    message = _resolve_response_message(service, bid)

    delivered = send_bid_response(
        candidate_name=bid.candidate_name or "",
        candidate_email=bid.candidate_email,
        role_title=role_title,
        decision=bid.decision_status or "pending",
        response_message=message,
    )

    if not delivered:
        service.log_message_event(
            bid=bid,
            event_type="email_delivery",
            title="Response email failed",
            detail="Final response email failed to send; decision withheld from candidate.",
            payload={"channel": "email", "status": "failed", "subject": subject},
        )
        return bid

    updated = service.send_response(bid)
    service.log_message_event(
        bid=updated,
        event_type="email_delivery",
        title="Response email delivered",
        detail="Final response email was sent to the candidate.",
        payload={"channel": "email", "status": "sent", "subject": subject},
    )
    return updated


def _finalize_no_match(service: Phase1BidService, bid):
    """Force a rejected decision (for correct messaging) and dispatch the final
    no-match response after the candidate's one-time revision."""
    if bid.decision_status != DECISION_REJECTED:
        bid = service.update_decision(
            bid=bid,
            decision_status=DECISION_REJECTED,
            match_score=None,
            decision_reason=bid.decision_reason,
            response_message=None,
        )
    return _dispatch_decision(service, bid)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _str_field(payload: dict, key: str) -> str | None:
    val = payload.get(key)
    return str(val).strip() if isinstance(val, str) and val.strip() else None


def _lookup(token: UUID, db: Session):  # returns (bid, service)
    service = Phase1BidService(db)
    bid = service.get_bid_by_token(token)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application invitation not found")
    return bid, service


def _build_lookup_response(bid, service, db: Session) -> PublicBidLookupResponse:
    already_submitted = bid.submission_status != SUBMISSION_STATUS_INVITATION_PENDING
    case = service.get_case(bid.case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated job listing not found")

    company_party = next((p for p in case.parties if p.party_type == "company"), None)
    pub = company_party.public_payload if company_party else {}

    job_title = _str_field(pub, "job_title") or _str_field(pub, "role_title") or case.title
    work_arrangement = _str_field(pub, "work_arrangement")
    location = _str_field(pub, "location") or case.jurisdiction
    company_description = _str_field(pub, "job_description") or case.description

    benefits: list[str] = []
    if pub.get("health_insurance"):
        benefits.append("Health Insurance")
    if pub.get("dental_vision"):
        benefits.append("Dental & Vision")
    if pub.get("retirement_401k"):
        benefits.append("401(k)")
    if pub.get("stock_options"):
        benefits.append("Stock Options")
    if pub.get("pto_days"):
        benefits.append(f"{pub['pto_days']} days PTO")
    if pub.get("wfh_days_per_week"):
        benefits.append(f"{pub['wfh_days_per_week']} WFH days/week")

    return PublicBidLookupResponse(
        already_submitted=already_submitted,
        requires_code=bool(bid.invitation_code),
        candidate_name=bid.candidate_name,
        job_title=job_title,
        company_description=company_description,
        work_arrangement=work_arrangement,
        location=location,
        currency=case.currency,
        benefits=benefits,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/apply/{token}", response_model=PublicBidLookupResponse)
def get_apply(token: UUID, db: Session = Depends(get_db)) -> PublicBidLookupResponse:
    bid, service = _lookup(token, db)
    return _build_lookup_response(bid, service, db)


@router.post("/apply/{token}/verify-code", response_model=VerifyCodeResponse)
def verify_code(token: UUID, payload: VerifyCodeRequest, db: Session = Depends(get_db)) -> VerifyCodeResponse:
    bid, service = _lookup(token, db)
    valid = service.verify_invitation_code(bid, payload.code)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid invitation code",
        )
    return VerifyCodeResponse(valid=True)


@router.post("/apply/{token}/submit", response_model=CandidateBidSubmitResponse)
def submit_apply(
    token: UUID,
    payload: CandidateBidSubmitRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> CandidateBidSubmitResponse:
    bid, service = _lookup(token, db)

    # Enforce invitation-code gate when the bid has a code set
    if bid.invitation_code:
        if not payload.invitation_code or not service.verify_invitation_code(bid, payload.invitation_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="A valid invitation code is required to submit this application",
            )

    service.submit_candidate_bid(
        bid=bid,
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        insurance_importance_rank=payload.insurance_importance_rank,
        pto_importance_rank=payload.pto_importance_rank,
        wfh_importance_rank=payload.wfh_importance_rank,
    )

    # Auto-trigger AI match in the background so the bid doesn't sit as "Pending AI match review"
    background_tasks.add_task(_run_ai_match_for_bid, bid_id=bid.id)

    return CandidateBidSubmitResponse(
        ok=True,
        message="Your application has been submitted. The hiring team will be in touch.",
    )


def _compute_candidate_state(bid, threshold: float) -> PublicApplyStatusResponse:
    """Map internal bid state to the candidate-facing determination contract.

    A binding decision (success / final_no_match) is only surfaced once the bid
    has been marked response_sent — which now happens exclusively after a real
    response email was dispatched and logged.
    """
    job_title = "the role"
    case = None
    currency = "USD"
    try:
        case = bid.case
    except Exception:  # noqa: BLE001
        case = None
    if case is not None:
        currency = case.currency
        company_party = next((p for p in case.parties if p.party_type == "company"), None)
        if company_party:
            pub = company_party.public_payload or {}
            job_title = _str_field(pub, "job_title") or _str_field(pub, "role_title") or case.title or job_title
        elif case.title:
            job_title = case.title

    dispatched = bid.submission_status == SUBMISSION_STATUS_SENT
    revision_used = bid.revision_count >= 1
    is_match = (
        bid.decision_status == DECISION_ACCEPTED
        and bid.match_score is not None
        and bid.match_score >= threshold
    )

    if bid.decision_status == DECISION_PENDING:
        return PublicApplyStatusResponse(
            processing_state="waiting", outcome="none",
            can_revise=False, revision_used=revision_used,
            job_title=job_title, currency=currency,
        )

    if is_match:
        if dispatched:
            return PublicApplyStatusResponse(
                processing_state="ready", outcome="success",
                can_revise=False, revision_used=revision_used,
                match_score=bid.match_score, decision_message=bid.response_message or None,
                job_title=job_title, currency=currency,
            )
        return PublicApplyStatusResponse(
            processing_state="finalizing", outcome="none",
            can_revise=False, revision_used=revision_used,
            job_title=job_title, currency=currency,
        )

    # Not a match.
    if not revision_used and not dispatched:
        return PublicApplyStatusResponse(
            processing_state="ready", outcome="revise_once",
            can_revise=True, revision_used=False,
            match_score=bid.match_score,
            job_title=job_title, currency=currency,
        )

    if dispatched:
        return PublicApplyStatusResponse(
            processing_state="ready", outcome="final_no_match",
            can_revise=False, revision_used=revision_used,
            match_score=bid.match_score, decision_message=bid.response_message or None,
            job_title=job_title, currency=currency,
        )

    return PublicApplyStatusResponse(
        processing_state="finalizing", outcome="none",
        can_revise=False, revision_used=revision_used,
        job_title=job_title, currency=currency,
    )


@router.get("/apply/{token}/status", response_model=PublicApplyStatusResponse)
def get_apply_status(token: UUID, db: Session = Depends(get_db)) -> PublicApplyStatusResponse:
    bid, service = _lookup(token, db)
    if bid.submission_status == SUBMISSION_STATUS_INVITATION_PENDING:
        case = service.get_case(bid.case_id)
        return PublicApplyStatusResponse(
            processing_state="waiting", outcome="none",
            can_revise=False, revision_used=False,
            job_title=(case.title if case else "the role"),
            currency=(case.currency if case else "USD"),
        )
    threshold = ConfigService(db).get_auto_accept_match_threshold()
    return _compute_candidate_state(bid, threshold)


@router.post("/apply/{token}/revise", response_model=PublicApplyStatusResponse)
def revise_apply(
    token: UUID,
    payload: CandidateBidSubmitRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> PublicApplyStatusResponse:
    bid, service = _lookup(token, db)

    if bid.invitation_code:
        if not payload.invitation_code or not service.verify_invitation_code(bid, payload.invitation_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="A valid invitation code is required to revise this application",
            )

    service.submit_candidate_revision(
        bid=bid,
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        insurance_importance_rank=payload.insurance_importance_rank,
        pto_importance_rank=payload.pto_importance_rank,
        wfh_importance_rank=payload.wfh_importance_rank,
    )

    background_tasks.add_task(_run_ai_match_for_bid, bid_id=bid.id)

    threshold = ConfigService(db).get_auto_accept_match_threshold()
    return _compute_candidate_state(bid, threshold)


# ── Background AI match ───────────────────────────────────────────────────────

async def _run_ai_match_for_bid(bid_id: UUID) -> None:
    """Evaluate a single newly-submitted bid with the LLM and set its decision."""
    db = SessionLocal()
    try:
        service = Phase1BidService(db)
        config_service = ConfigService(db)
        bid = service.get_bid(bid_id)
        if bid is None or bid.decision_status != DECISION_PENDING:
            return

        case = service.get_case(bid.case_id)
        if case is None:
            return

        system_prompt = (
            "You are evaluating a single phase 1 applicant bid for a hiring team. "
            "Return JSON only with a single object containing keys: "
            "match_score (number from 0 to 100), "
            "decision_status (must be 'accepted' or 'rejected'), "
            "decision_reason (one concise sentence), "
            "response_message (professional message to send the candidate). "
            "Do not reject candidates simply for having a target salary or for being below target. "
            "Use affordability logic to filter out candidates who are too high on total compensation and benefits."
        )
        user_prompt = (
            f"Evaluate this bid for the role: {case.title}\n"
            f"Operator guidance: {case.operator_guidance}\n"
            f"Candidate salary range: {bid.salary_min}–{bid.salary_max} {case.currency}\n"
            f"Insurance rank: {bid.insurance_importance_rank}/3, "
            f"PTO rank: {bid.pto_importance_rank}/3, "
            f"WFH rank: {bid.wfh_importance_rank}/3"
        )

        provider = get_provider()
        result = await provider.generate(
            system_prompt=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0.1,
        )

        import json as _json
        content = str(result.get("content", ""))
        try:
            start = content.find("{")
            end = content.rfind("}")
            if start == -1 or end <= start:
                return
            parsed = _json.loads(content[start : end + 1])
        except Exception:
            return

        decision = str(parsed.get("decision_status", "")).strip().lower()
        if decision not in {DECISION_ACCEPTED, DECISION_REJECTED}:
            return

        try:
            match_score = float(parsed.get("match_score"))
        except (TypeError, ValueError):
            match_score = None

        updated = service.update_decision(
            bid=bid,
            decision_status=decision,
            match_score=match_score,
            decision_reason=str(parsed.get("decision_reason", "")).strip() or None,
            response_message=str(parsed.get("response_message", "")).strip() or None,
        )

        threshold = config_service.get_auto_accept_match_threshold()
        if updated.submission_status == SUBMISSION_STATUS_SUBMITTED:
            is_match = _should_auto_send_response(
                decision_status=updated.decision_status,
                match_score=updated.match_score,
                threshold=threshold,
            )
            if is_match:
                # Strong match → dispatch the acceptance response immediately.
                _dispatch_decision(service, updated)
            elif updated.revision_count >= 1:
                # Not a match and the one-time revision has been used → final answer.
                _finalize_no_match(service, updated)
            # else: not a match on the first pass → leave open so the candidate
            # can use their one-time revision before any decision is dispatched.
    except Exception as exc:
        logger.warning("Auto AI match failed for bid %s: %s", bid_id, exc)
    finally:
        db.close()
