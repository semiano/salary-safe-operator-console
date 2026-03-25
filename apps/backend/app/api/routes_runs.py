from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.message import RunArtifact, RunMessage
from app.models.run import NegotiationRun
from app.schemas.message import RunArtifactResponse, RunMessageResponse
from app.schemas.run import RunResponse
from app.services.event_stream_service import EventStreamService
from app.services.run_service import RunService

router = APIRouter(prefix="/runs", tags=["runs"], dependencies=[Depends(get_current_user)])


@router.get("/health")
def runs_health() -> dict[str, str]:
    return {"status": "ok"}


def _to_run_response(run: NegotiationRun) -> RunResponse:
    return RunResponse(
        id=run.id,
        case_id=run.case_id,
        run_config_id=run.run_config_id,
        prompt_set_id=run.prompt_set_id,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        provider=run.provider,
        model_name=run.model_name,
        orchestration_mode=run.orchestration_mode,
        summary_json=run.summary_json,
        final_report_json=run.final_report_json,
        error_text=run.error_text,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def _to_message_response(message: RunMessage) -> RunMessageResponse:
    return RunMessageResponse(
        id=message.id,
        run_id=message.run_id,
        phase=message.phase,
        round_number=message.round_number,
        speaker_agent=message.speaker_agent,
        visibility=message.visibility,
        message_type=message.message_type,
        content=message.content,
        structured_payload=message.structured_payload,
        created_at=message.created_at,
        updated_at=message.updated_at,
    )


def _to_artifact_response(artifact: RunArtifact) -> RunArtifactResponse:
    return RunArtifactResponse(
        id=artifact.id,
        run_id=artifact.run_id,
        artifact_type=artifact.artifact_type,
        payload=artifact.payload,
        created_at=artifact.created_at,
        updated_at=artifact.updated_at,
    )


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: UUID, db: Session = Depends(get_db)) -> RunResponse:
    run = RunService(db).get_run(run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return _to_run_response(run)


@router.get("/{run_id}/messages", response_model=list[RunMessageResponse])
def get_run_messages(run_id: UUID, db: Session = Depends(get_db)) -> list[RunMessageResponse]:
    messages = RunService(db).list_messages(run_id)
    return [_to_message_response(message) for message in messages]


@router.get("/{run_id}/artifacts", response_model=list[RunArtifactResponse])
def get_run_artifacts(run_id: UUID, db: Session = Depends(get_db)) -> list[RunArtifactResponse]:
    artifacts = RunService(db).list_artifacts(run_id)
    return [_to_artifact_response(artifact) for artifact in artifacts]


@router.get("/{run_id}/report", response_model=dict)
def get_run_report(run_id: UUID, db: Session = Depends(get_db)) -> dict:
    run = RunService(db).get_run(run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    if run.final_report_json is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Final report not found")
    return run.final_report_json


@router.get("/{run_id}/stream")
def stream_run(run_id: UUID, db: Session = Depends(get_db)) -> StreamingResponse:
    run = RunService(db).get_run(run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    stream = EventStreamService(RunService(db)).stream_run_events(run_id)
    return StreamingResponse(stream, media_type="text/event-stream")
