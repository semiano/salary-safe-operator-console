from pydantic import BaseModel, Field


class GlobalSettingsResponse(BaseModel):
    auto_accept_match_threshold: float = Field(ge=0, le=100)


class GlobalSettingsUpdateRequest(BaseModel):
    auto_accept_match_threshold: float = Field(ge=0, le=100)
