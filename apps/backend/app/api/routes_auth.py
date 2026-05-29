from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import create_access_token, get_current_user
from app.core.settings import get_settings
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.auth import CurrentUserResponse, LoginRequest, TokenResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/health")
def auth_health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = AuthService(db).authenticate(payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    settings = get_settings()

    # Look up tenant alias for JWT claim (best-effort; falls back to tenant_id)
    tenant_alias: str | None = None
    try:
        tenant = db.get(Tenant, user.tenant_id)
        if tenant:
            tenant_alias = tenant.alias
    except Exception:
        pass

    token = create_access_token(
        str(user.id),
        settings.access_token_expire_minutes,
        role=user.role,
        tenant_id=str(user.tenant_id),
        tenant_alias=tenant_alias,
        email=user.email,
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=CurrentUserResponse)
def me(current_user: User = Depends(get_current_user)) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
    )
