from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.prompt import PromptSet


class PromptService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_prompt_set(self, payload: dict) -> PromptSet:
        prompt_set = PromptSet(**payload)
        self.db.add(prompt_set)
        self.db.commit()
        self.db.refresh(prompt_set)
        return prompt_set

    def list_prompt_sets(self) -> list[PromptSet]:
        stmt = select(PromptSet).order_by(PromptSet.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def get_prompt_set(self, prompt_set_id: UUID) -> PromptSet | None:
        return self.db.get(PromptSet, prompt_set_id)

    def update_prompt_set(self, prompt_set: PromptSet, payload: dict) -> PromptSet:
        for key, value in payload.items():
            setattr(prompt_set, key, value)
        self.db.commit()
        self.db.refresh(prompt_set)
        return prompt_set
