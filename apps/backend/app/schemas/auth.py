from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUserResponse(BaseModel):
    id: UUID
    email: EmailStr
    role: str
    created_at: datetime
    updated_at: datetime
