from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


VALID_DECISION_STATUSES = {"pending", "accepted", "rejected"}


class Phase1BidCreateRequest(BaseModel):
    applicant_identifier: str = Field(min_length=3, max_length=255)
    salary_min: float = Field(gt=0)
    salary_max: float = Field(gt=0)
    insurance_importance_rank: int = Field(ge=1, le=3)
    pto_importance_rank: int = Field(ge=1, le=3)
    wfh_importance_rank: int = Field(ge=1, le=3)

    @field_validator("salary_max")
    @classmethod
    def validate_salary_range(cls, value: float, info):
        salary_min = info.data.get("salary_min")
        if salary_min is not None and value < salary_min:
            raise ValueError("salary_max must be greater than or equal to salary_min")
        return value


class Phase1BidSimulateRequest(BaseModel):
    """Create a simulated candidate submission — skips the invitation link flow."""
    candidate_name: str = Field(min_length=1, max_length=255)
    candidate_email: EmailStr
    salary_min: float = Field(gt=0)
    salary_max: float = Field(gt=0)
    insurance_importance_rank: int = Field(ge=1, le=3)
    pto_importance_rank: int = Field(ge=1, le=3)
    wfh_importance_rank: int = Field(ge=1, le=3)

    @field_validator("salary_max")
    @classmethod
    def validate_salary_range(cls, value: float, info):
        salary_min = info.data.get("salary_min")
        if salary_min is not None and value < salary_min:
            raise ValueError("salary_max must be >= salary_min")
        return value


class Phase1BidInviteRequest(BaseModel):
    candidate_email: EmailStr
    candidate_name: str | None = Field(default=None, max_length=255)


class Phase1BidBulkInviteRequest(BaseModel):
    invitations: list[Phase1BidInviteRequest] = Field(min_length=1)


class Phase1BidDecisionUpdateRequest(BaseModel):
    decision_status: str = Field(min_length=1)
    decision_reason: str | None = None
    response_message: str | None = None

    @field_validator("decision_status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in VALID_DECISION_STATUSES - {"pending"}:
            raise ValueError("decision_status must be accepted or rejected")
        return normalized


class Phase1BidResponseMessageUpdateRequest(BaseModel):
    response_message: str = Field(min_length=1)


class Phase1BidUpdateRequest(BaseModel):
    """Admin-only: edit the candidate's submitted bid fields."""
    candidate_name: str | None = Field(default=None, max_length=255)
    candidate_email: EmailStr | None = None
    salary_min: float = Field(gt=0)
    salary_max: float = Field(gt=0)
    insurance_importance_rank: int = Field(ge=1, le=3)
    pto_importance_rank: int = Field(ge=1, le=3)
    wfh_importance_rank: int = Field(ge=1, le=3)

    @field_validator("salary_max")
    @classmethod
    def validate_salary_range(cls, value: float, info):
        salary_min = info.data.get("salary_min")
        if salary_min is not None and value < salary_min:
            raise ValueError("salary_max must be >= salary_min")
        return value


class Phase1BidBulkDecisionRequest(BaseModel):
    operator_guidance: str = Field(min_length=10)


class Phase1BidResponse(BaseModel):
    id: UUID
    case_id: UUID
    token: UUID
    applicant_identifier: str
    candidate_email: str | None
    candidate_name: str | None
    is_invitation: bool
    invitation_code: str | None
    salary_min: float
    salary_max: float
    insurance_importance_rank: int
    pto_importance_rank: int
    wfh_importance_rank: int
    submission_status: str
    decision_status: str
    decision_reason: str | None
    response_message: str
    received_at: datetime
    sent_at: datetime | None
    candidate_submitted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class Phase1BidBulkDecisionResult(BaseModel):
    processed_count: int
    skipped_count: int
    updated_bid_ids: list[UUID] = Field(default_factory=list)


class Phase1BidRandomGenerateRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=10)
    additional_guidance: str | None = None


class Phase1BidRandomGenerateResult(BaseModel):
    created_count: int


# ── Public candidate-facing schemas (no auth) ─────────────────────────────────

class PublicBidLookupResponse(BaseModel):
    """Job listing info shown to the candidate on the bid form — no confidential budget data."""
    ok: bool = True
    already_submitted: bool
    requires_code: bool = False
    candidate_name: str | None
    job_title: str
    company_description: str | None
    work_arrangement: str | None
    location: str | None
    currency: str
    benefits: list[str]


class CandidateBidSubmitRequest(BaseModel):
    salary_min: float = Field(gt=0)
    salary_max: float = Field(gt=0)
    insurance_importance_rank: int = Field(ge=1, le=3)
    pto_importance_rank: int = Field(ge=1, le=3)
    wfh_importance_rank: int = Field(ge=1, le=3)
    invitation_code: str | None = Field(default=None, max_length=10)

    @field_validator("salary_max")
    @classmethod
    def validate_salary_range(cls, value: float, info):
        salary_min = info.data.get("salary_min")
        if salary_min is not None and value < salary_min:
            raise ValueError("salary_max must be greater than or equal to salary_min")
        return value


class CandidateBidSubmitResponse(BaseModel):
    ok: bool = True
    message: str


class VerifyCodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=10)


class VerifyCodeResponse(BaseModel):
    valid: bool


# ── Dashboard stats schema ─────────────────────────────────────────────────────

class BidStats(BaseModel):
    invitations_sent: int
    bids_received: int


class CaseBidStatsResponse(BaseModel):
    stats: dict[str, BidStats]

    created_bid_ids: list[UUID] = Field(default_factory=list)
