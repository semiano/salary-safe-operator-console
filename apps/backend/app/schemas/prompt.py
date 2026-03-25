from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PromptSetCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)
    description: str | None = None
    candidate_rep_prompt: str = Field(min_length=1)
    company_rep_prompt: str = Field(min_length=1)
    arbitrator_prompt: str = Field(min_length=1)
    intake_prompt: str = Field(min_length=1)
    policy_prompt: str = Field(min_length=1)


class PromptSetUpdateRequest(BaseModel):
    name: str | None = None
    version: str | None = None
    description: str | None = None
    candidate_rep_prompt: str | None = None
    company_rep_prompt: str | None = None
    arbitrator_prompt: str | None = None
    intake_prompt: str | None = None
    policy_prompt: str | None = None


class PromptSetResponse(BaseModel):
    id: UUID
    name: str
    version: str
    description: str | None
    candidate_rep_prompt: str
    company_rep_prompt: str
    arbitrator_prompt: str
    intake_prompt: str
    policy_prompt: str
    created_at: datetime
    updated_at: datetime
