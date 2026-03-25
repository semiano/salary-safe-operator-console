from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PartyInputPayload(BaseModel):
    public_payload: dict[str, Any] = Field(default_factory=dict)
    confidential_payload: dict[str, Any] = Field(default_factory=dict)


class CaseCreateRequest(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = None
    status: str = Field(default="draft")
    jurisdiction: str | None = None
    currency: str = Field(default="USD")
    candidate: PartyInputPayload
    company: PartyInputPayload


class CaseCreateFromPromptRequest(BaseModel):
    prompt: str = Field(min_length=10)
    jurisdiction: str | None = None
    currency: str = Field(default="USD")


class RandomCasePromptResponse(BaseModel):
    prompt: str


class CaseUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    jurisdiction: str | None = None
    currency: str | None = None
    candidate: PartyInputPayload | None = None
    company: PartyInputPayload | None = None


class CasePartyResponse(BaseModel):
    id: UUID
    case_id: UUID
    party_type: str
    public_payload: dict[str, Any]
    confidential_payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class CaseResponse(BaseModel):
    id: UUID
    title: str
    description: str | None
    created_by: UUID | None
    status: str
    jurisdiction: str | None
    currency: str
    created_at: datetime
    updated_at: datetime
    parties: list[CasePartyResponse] = Field(default_factory=list)
