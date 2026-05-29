from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter(prefix="/tenants", tags=["tenants"])


class TenantResponse(BaseModel):
    id: str
    alias: str
    slug: str
    plan: str

    model_config = {"from_attributes": True}


class TenantUpdateRequest(BaseModel):
    alias: str | None = None
    slug: str | None = None


@router.get("/me", response_model=TenantResponse)
def get_my_tenant(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantResponse:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return TenantResponse(
        id=str(tenant.id),
        alias=tenant.alias,
        slug=tenant.slug,
        plan=tenant.plan,
    )


@router.patch("/me", response_model=TenantResponse)
def update_my_tenant(
    payload: TenantUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantResponse:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can update tenant settings")

    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    if payload.alias is not None:
        tenant.alias = payload.alias
    if payload.slug is not None:
        # Check uniqueness
        existing = db.query(Tenant).filter(Tenant.slug == payload.slug, Tenant.id != tenant.id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already in use")
        tenant.slug = payload.slug

    db.commit()
    db.refresh(tenant)
    return TenantResponse(
        id=str(tenant.id),
        alias=tenant.alias,
        slug=tenant.slug,
        plan=tenant.plan,
    )
