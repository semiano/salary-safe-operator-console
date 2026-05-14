"""Public (unauthenticated) endpoints for the candidate bid invitation form."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.phase1_bid import (
    CandidateBidSubmitRequest,
    CandidateBidSubmitResponse,
    PublicBidLookupResponse,
)
from app.services.phase1_bid_service import (
    SUBMISSION_STATUS_INVITATION_PENDING,
    Phase1BidService,
)

router = APIRouter(tags=["public-bid"])


@router.get("/bid/{token}", response_model=PublicBidLookupResponse)
def get_public_bid(token: UUID, db: Session = Depends(get_db)) -> PublicBidLookupResponse:
    service = Phase1BidService(db)
    bid = service.get_bid_by_token(token)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bid invitation not found")

    already_submitted = bid.submission_status != SUBMISSION_STATUS_INVITATION_PENDING

    case = service.get_case(bid.case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated case not found")

    # Pull public info from the company party (never expose confidential budget)
    company_party = next((p for p in case.parties if p.party_type == "company"), None)
    pub = company_party.public_payload if company_party else {}

    job_title = _str_field(pub, "job_title") or _str_field(pub, "role_title") or case.title
    work_arrangement = _str_field(pub, "work_arrangement")
    location = _str_field(pub, "location") or case.jurisdiction
    company_description = _str_field(pub, "job_description") or case.description

    # Collect listed benefits
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
        candidate_name=bid.candidate_name,
        job_title=job_title,
        company_description=company_description,
        work_arrangement=work_arrangement,
        location=location,
        currency=case.currency,
        benefits=benefits,
    )


@router.post("/bid/{token}/submit", response_model=CandidateBidSubmitResponse)
def submit_candidate_bid(
    token: UUID,
    payload: CandidateBidSubmitRequest,
    db: Session = Depends(get_db),
) -> CandidateBidSubmitResponse:
    service = Phase1BidService(db)
    bid = service.get_bid_by_token(token)
    if bid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bid invitation not found")

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
        message="Your bid has been submitted. The hiring team will be in touch.",
    )


def _str_field(payload: dict, key: str) -> str | None:
    val = payload.get(key)
    return str(val).strip() if isinstance(val, str) and val.strip() else None
