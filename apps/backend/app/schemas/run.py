from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class TemperatureProfile(BaseModel):
    intake: float = Field(ge=0.0, le=2.0)
    candidate_rep: float = Field(ge=0.0, le=2.0)
    company_rep: float = Field(ge=0.0, le=2.0)
    policy_guard: float = Field(ge=0.0, le=2.0)
    arbitrator: float = Field(ge=0.0, le=2.0)


class RunConfigPayload(BaseModel):
    provider: Literal["openai", "azure_openai"]
    model_name: str = Field(min_length=1)
    temperature_profile: TemperatureProfile
    conversation_mode: str = Field(default="hybrid_guided_groupchat")
    max_rounds: int = Field(default=5, ge=1, le=20)
    max_turns_per_round: int = Field(default=3, ge=1, le=10)
    enable_policy_guard: bool = True
    enable_admin_trace: bool = True
    require_structured_proposals: bool = True
    allow_title_tradeoffs: bool = True
    allow_equity_tradeoffs: bool = True
    allow_review_cycle_tradeoffs: bool = True
    deadlock_repeat_threshold: int = Field(default=2, ge=1, le=10)
    rerun_count: int = Field(default=1, ge=1, le=20)
    turn_delay_seconds: float = Field(default=1.5, ge=0.0, le=10.0)


class RunConfigCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    config: RunConfigPayload


class RunConfigResponse(BaseModel):
    id: UUID
    case_id: UUID
    name: str
    config_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class RunCreateRequest(BaseModel):
    run_config_id: UUID
    prompt_set_id: UUID


class RunResponse(BaseModel):
    id: UUID
    case_id: UUID
    run_config_id: UUID
    prompt_set_id: UUID
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    provider: str
    model_name: str
    orchestration_mode: str
    summary_json: dict[str, Any] | None
    final_report_json: dict[str, Any] | None
    error_text: str | None
    created_at: datetime
    updated_at: datetime
