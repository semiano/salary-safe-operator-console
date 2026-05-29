import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

DEFAULT_OPERATOR_GUIDANCE = (
    "Evaluate overall affordability and fit; prioritize candidates whose expected total compensation "
    "and benefits fit the role constraints. "
    "Do not reject candidates simply for having a target salary or for being below target. "
    "Filter out candidates who are too high on total compensation and benefits. "
    "Prioritize candidates who rank health insurance as a top benefit. "
    "Use professional, encouraging language in all response messages."
)


class NegotiationCase(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "job_listings"

    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    jurisdiction: Mapped[str | None] = mapped_column(String(50), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, server_default="USD")
    operator_guidance: Mapped[str] = mapped_column(Text, nullable=False, default=DEFAULT_OPERATOR_GUIDANCE)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    parties: Mapped[list["CaseParty"]] = relationship(back_populates="case", cascade="all, delete-orphan")
    phase1_bids: Mapped[list["Phase1Bid"]] = relationship(back_populates="case", cascade="all, delete-orphan")


class CaseParty(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "job_listing_parties"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_listings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    party_type: Mapped[str] = mapped_column(String(20), nullable=False)
    public_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    confidential_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    case: Mapped[NegotiationCase] = relationship(back_populates="parties")


class Phase1Bid(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "candidate_applications"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_listings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    token: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, nullable=False, default=uuid.uuid4)
    applicant_identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    candidate_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    candidate_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # is_invitation: True = sent to candidate; they fill the form. False = directly created bid.
    is_invitation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    salary_min: Mapped[float] = mapped_column(nullable=False)
    salary_max: Mapped[float] = mapped_column(nullable=False)
    insurance_importance_rank: Mapped[int] = mapped_column(nullable=False)
    pto_importance_rank: Mapped[int] = mapped_column(nullable=False)
    wfh_importance_rank: Mapped[int] = mapped_column(nullable=False)
    submission_status: Mapped[str] = mapped_column(String(50), nullable=False, server_default="applicant_bid_submitted")
    decision_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_message: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    candidate_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invitation_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    case: Mapped[NegotiationCase] = relationship(back_populates="phase1_bids")
