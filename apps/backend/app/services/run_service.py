from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.message import RunArtifact, RunMessage
from app.models.run import NegotiationRun


class RunService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_run(
        self,
        *,
        case_id: UUID,
        run_config_id: UUID,
        prompt_set_id: UUID,
        provider: str,
        model_name: str,
        orchestration_mode: str,
    ) -> NegotiationRun:
        run = NegotiationRun(
            case_id=case_id,
            run_config_id=run_config_id,
            prompt_set_id=prompt_set_id,
            status="queued",
            provider=provider,
            model_name=model_name,
            orchestration_mode=orchestration_mode,
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def get_run(self, run_id: UUID) -> NegotiationRun | None:
        return self.db.get(NegotiationRun, run_id)

    def set_run_status(self, run: NegotiationRun, status: str) -> NegotiationRun:
        run.status = status
        if status == "running":
            run.started_at = datetime.now(timezone.utc)
        if status in {"completed", "failed"}:
            run.completed_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(run)
        return run

    def set_run_error(self, run: NegotiationRun, error_text: str) -> NegotiationRun:
        run.status = "failed"
        run.error_text = error_text
        run.completed_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(run)
        return run

    def save_run_message(
        self,
        *,
        run_id: UUID,
        phase: str,
        round_number: int,
        speaker_agent: str,
        visibility: str,
        message_type: str,
        content: str,
        structured_payload: dict | None = None,
    ) -> RunMessage:
        message = RunMessage(
            run_id=run_id,
            phase=phase,
            round_number=round_number,
            speaker_agent=speaker_agent,
            visibility=visibility,
            message_type=message_type,
            content=content,
            structured_payload=structured_payload,
        )
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)
        return message

    def save_run_artifact(self, run_id: UUID, artifact_type: str, payload: dict) -> RunArtifact:
        artifact = RunArtifact(run_id=run_id, artifact_type=artifact_type, payload=payload)
        self.db.add(artifact)
        self.db.commit()
        self.db.refresh(artifact)
        return artifact

    def list_messages(self, run_id: UUID) -> list[RunMessage]:
        stmt = select(RunMessage).where(RunMessage.run_id == run_id).order_by(RunMessage.created_at.asc())
        return list(self.db.scalars(stmt).all())

    def list_runs_for_case(self, case_id: UUID) -> list[NegotiationRun]:
        stmt = select(NegotiationRun).where(NegotiationRun.case_id == case_id).order_by(NegotiationRun.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def list_artifacts(self, run_id: UUID) -> list[RunArtifact]:
        stmt = select(RunArtifact).where(RunArtifact.run_id == run_id).order_by(RunArtifact.created_at.asc())
        return list(self.db.scalars(stmt).all())
