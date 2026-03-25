from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class PromptSet(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "prompt_sets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    candidate_rep_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    company_rep_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    arbitrator_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    intake_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    policy_prompt: Mapped[str] = mapped_column(Text, nullable=False)
