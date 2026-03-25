from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.config import RunConfig


class ConfigService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_run_config(self, case_id: UUID, name: str, config_json: dict) -> RunConfig:
        config = RunConfig(case_id=case_id, name=name, config_json=config_json)
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return config

    def list_run_configs(self, case_id: UUID | None = None) -> list[RunConfig]:
        stmt = select(RunConfig).order_by(RunConfig.created_at.desc())
        if case_id is not None:
            stmt = stmt.where(RunConfig.case_id == case_id)
        return list(self.db.scalars(stmt).all())
