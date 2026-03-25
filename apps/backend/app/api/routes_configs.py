from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.config import RunConfig
from app.schemas.run import RunConfigCreateRequest, RunConfigResponse
from app.services.config_service import ConfigService

router = APIRouter(prefix="/configs", tags=["configs"], dependencies=[Depends(get_current_user)])


@router.get("/health")
def configs_health() -> dict[str, str]:
    return {"status": "ok"}


def _to_config_response(config: RunConfig) -> RunConfigResponse:
    return RunConfigResponse(
        id=config.id,
        case_id=config.case_id,
        name=config.name,
        config_json=config.config_json,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@router.post("", response_model=RunConfigResponse, status_code=status.HTTP_201_CREATED)
def create_run_config(
    case_id: UUID = Query(...),
    payload: RunConfigCreateRequest = ..., 
    db: Session = Depends(get_db),
) -> RunConfigResponse:
    config = ConfigService(db).create_run_config(case_id=case_id, name=payload.name, config_json=payload.config.model_dump())
    return _to_config_response(config)


@router.get("", response_model=list[RunConfigResponse])
def list_run_configs(case_id: UUID | None = Query(default=None), db: Session = Depends(get_db)) -> list[RunConfigResponse]:
    configs = ConfigService(db).list_run_configs(case_id)
    return [_to_config_response(config) for config in configs]
