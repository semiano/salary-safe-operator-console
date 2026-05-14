"""Public (unauthenticated) /apply/{token} endpoints — new-taxonomy mirror of /bid/{token}.

Adds an invitation-code gate:
  GET  /apply/{token}             → job info + requires_code flag
  POST /apply/{token}/verify-code → validate code, 200 or 403
  POST /apply/{token}/submit      → submit, checks code if required
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.phase1_bid import (
    CandidateBidSubmitRequest,
    CandidateBidSubmitResponse,
    PublicBidLookupResponse,
    VerifyCodeRequest,
    VerifyCodeResponse,
)
from app.services.phase1_bid_service import (
    SUBMISSION_STATUS_INVITATION_PENDING,
    Phase1BidService,
)

router = APIRouter(tags=["apply"])


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

    return CandidateBidSubmitResponse(
        ok=True,
        message="Your application has been submitted. The hiring team will be in touch.",
    )
