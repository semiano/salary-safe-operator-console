from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class RunMessageResponse(BaseModel):
    id: UUID
    run_id: UUID
    phase: str
    round_number: int
    speaker_agent: str
    visibility: str
    message_type: str
    content: str
    structured_payload: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class RunArtifactResponse(BaseModel):
    id: UUID
    run_id: UUID
    artifact_type: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class RunMetricResponse(BaseModel):
    id: UUID
    run_id: UUID
    metric_name: str
    metric_value: Decimal | None
    metric_json: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
