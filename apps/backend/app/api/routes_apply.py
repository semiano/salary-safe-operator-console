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


def _send_response_with_email(service: Phase1BidService, bid) -> None:
    updated = service.send_response(bid)
    if not updated.candidate_email:
        return

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
        if (
            updated.submission_status == SUBMISSION_STATUS_SUBMITTED
            and _should_auto_send_response(
                decision_status=updated.decision_status,
                match_score=updated.match_score,
                threshold=threshold,
            )
        ):
            _send_response_with_email(service, updated)
    except Exception as exc:
        logger.warning("Auto AI match failed for bid %s: %s", bid_id, exc)
    finally:
        db.close()
