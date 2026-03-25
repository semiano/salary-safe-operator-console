from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.prompt import PromptSet
from app.schemas.prompt import PromptSetCreateRequest, PromptSetResponse, PromptSetUpdateRequest
from app.services.prompt_service import PromptService

router = APIRouter(prefix="/prompts", tags=["prompts"], dependencies=[Depends(get_current_user)])


@router.get("/health")
def prompts_health() -> dict[str, str]:
    return {"status": "ok"}


def _to_prompt_response(prompt_set: PromptSet) -> PromptSetResponse:
    return PromptSetResponse(
        id=prompt_set.id,
        name=prompt_set.name,
        version=prompt_set.version,
        description=prompt_set.description,
        candidate_rep_prompt=prompt_set.candidate_rep_prompt,
        company_rep_prompt=prompt_set.company_rep_prompt,
        arbitrator_prompt=prompt_set.arbitrator_prompt,
        intake_prompt=prompt_set.intake_prompt,
        policy_prompt=prompt_set.policy_prompt,
        created_at=prompt_set.created_at,
        updated_at=prompt_set.updated_at,
    )


@router.post("", response_model=PromptSetResponse, status_code=status.HTTP_201_CREATED)
def create_prompt_set(payload: PromptSetCreateRequest, db: Session = Depends(get_db)) -> PromptSetResponse:
    prompt_set = PromptService(db).create_prompt_set(payload.model_dump())
    return _to_prompt_response(prompt_set)


@router.get("", response_model=list[PromptSetResponse])
def list_prompt_sets(db: Session = Depends(get_db)) -> list[PromptSetResponse]:
    prompt_sets = PromptService(db).list_prompt_sets()
    return [_to_prompt_response(prompt_set) for prompt_set in prompt_sets]


@router.put("/{prompt_set_id}", response_model=PromptSetResponse)
def update_prompt_set(
    prompt_set_id: UUID,
    payload: PromptSetUpdateRequest,
    db: Session = Depends(get_db),
) -> PromptSetResponse:
    service = PromptService(db)
    prompt_set = service.get_prompt_set(prompt_set_id)
    if prompt_set is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt set not found")

    updated = service.update_prompt_set(prompt_set, payload.model_dump(exclude_none=True))
    return _to_prompt_response(updated)
