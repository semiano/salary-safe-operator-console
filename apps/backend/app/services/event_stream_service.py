import json
from collections.abc import Iterator
from uuid import UUID

from app.services.run_service import RunService


class EventStreamService:
    def __init__(self, run_service: RunService) -> None:
        self.run_service = run_service

    def stream_run_events(self, run_id: UUID) -> Iterator[str]:
        run = self.run_service.get_run(run_id)
        if run is None:
            error_payload = {"status": "error", "detail": "Run not found"}
            yield self._format_sse("status", error_payload)
            return

        yield self._format_sse("status", {"run_id": str(run.id), "status": run.status})

        messages = self.run_service.list_messages(run_id)
        for message in messages:
            payload = {
                "id": str(message.id),
                "run_id": str(message.run_id),
                "phase": message.phase,
                "round_number": message.round_number,
                "speaker_agent": message.speaker_agent,
                "visibility": message.visibility,
                "message_type": message.message_type,
                "content": message.content,
                "structured_payload": message.structured_payload,
                "created_at": message.created_at.isoformat(),
            }
            yield self._format_sse("message", payload)

        artifacts = self.run_service.list_artifacts(run_id)
        for artifact in artifacts:
            payload = {
                "id": str(artifact.id),
                "run_id": str(artifact.run_id),
                "artifact_type": artifact.artifact_type,
                "payload": artifact.payload,
                "created_at": artifact.created_at.isoformat(),
            }
            yield self._format_sse("artifact", payload)

        completion_payload = {
            "run_id": str(run.id),
            "status": run.status,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }
        yield self._format_sse("completion", completion_payload)

    @staticmethod
    def _format_sse(event: str, payload: dict) -> str:
        data = json.dumps(payload)
        return f"event: {event}\ndata: {data}\n\n"
