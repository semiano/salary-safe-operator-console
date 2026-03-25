import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class RunMessage(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "run_messages"

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("negotiation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phase: Mapped[str] = mapped_column(String(50), nullable=False)
    round_number: Mapped[int] = mapped_column(nullable=False)
    speaker_agent: Mapped[str] = mapped_column(String(100), nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False)
    message_type: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    structured_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class RunArtifact(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "run_artifacts"

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("negotiation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    artifact_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class RunMetric(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "run_metrics"

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("negotiation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    metric_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
