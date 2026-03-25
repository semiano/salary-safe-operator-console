import uuid
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class NegotiationCase(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "negotiation_cases"

    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    jurisdiction: Mapped[str | None] = mapped_column(String(50), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, server_default="USD")

    parties: Mapped[list["CaseParty"]] = relationship(back_populates="case", cascade="all, delete-orphan")


class CaseParty(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "case_parties"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("negotiation_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    party_type: Mapped[str] = mapped_column(String(20), nullable=False)
    public_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    confidential_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    case: Mapped[NegotiationCase] = relationship(back_populates="parties")
