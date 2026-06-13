from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.admin import GlobalSettingsResponse, GlobalSettingsUpdateRequest
from app.services.config_service import ConfigService

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_user)])


def _require_admin(current_user: User) -> None:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")


@router.get("/health")
def admin_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/global-settings", response_model=GlobalSettingsResponse)
def get_global_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GlobalSettingsResponse:
    _require_admin(current_user)
    config_service = ConfigService(db)
    return GlobalSettingsResponse(
        auto_accept_match_threshold=config_service.get_auto_accept_match_threshold(),
    )


@router.put("/global-settings", response_model=GlobalSettingsResponse)
def update_global_settings(
    payload: GlobalSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GlobalSettingsResponse:
    _require_admin(current_user)
    config_service = ConfigService(db)
    threshold = config_service.set_auto_accept_match_threshold(payload.auto_accept_match_threshold)
    return GlobalSettingsResponse(auto_accept_match_threshold=threshold)
