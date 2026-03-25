from fastapi import APIRouter, Depends

from app.core.security import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_user)])


@router.get("/health")
def admin_health() -> dict[str, str]:
    return {"status": "ok"}
