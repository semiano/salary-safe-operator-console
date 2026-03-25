import uuid
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class NegotiationRun(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "negotiation_runs"

    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("negotiation_cases.id"), nullable=False)
    run_config_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("run_configs.id"), nullable=False)
    prompt_set_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("prompt_sets.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    orchestration_mode: Mapped[str] = mapped_column(String(100), nullable=False)
    summary_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    final_report_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_text: Mapped[str | None] = mapped_column(Text, nullable=True)
