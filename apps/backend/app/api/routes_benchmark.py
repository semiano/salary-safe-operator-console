"""Benchmark API routes — /api/benchmark/..."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.benchmark import (
    ApplyRecommendationRequest,
    BenchmarkMatchResponse,
    BenchmarkRunResponse,
    ChatRequest,
    ChatResponse,
    DatasetMappingRequest,
    DatasetResponse,
    DatasetRowPreview,
    DatasetRowsResponse,
    RecommendationResponse,
    RunExternalBenchmarkRequest,
    RunInternalBenchmarkRequest,
)
from app.services.benchmark_service import BenchmarkService

router = APIRouter(
    prefix="/benchmark",
    tags=["benchmark"],
    dependencies=[Depends(get_current_user)],
)

_ALLOWED_DATASET_CONTENT_TYPES = {
    "text/csv",
    "application/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
}
_MAX_CSV_SIZE = 20 * 1024 * 1024  # 20 MB
_ALLOWED_DATASET_EXTENSIONS = {".csv", ".xlsx"}


def _dataset_to_response(ds: object) -> DatasetResponse:
    from app.models.benchmark import BenchmarkDataset
    assert isinstance(ds, BenchmarkDataset)
    return DatasetResponse(
        id=ds.id,
        source_type=ds.source_type,
        dataset_name=ds.dataset_name,
        original_filename=ds.original_filename,
        uploaded_by=ds.uploaded_by,
        row_count=ds.row_count,
        column_mapping_json=ds.column_mapping_json,
        status=ds.status,
        is_global=ds.is_global,
        is_active=ds.is_active,
        tenant_id=ds.tenant_id,
        created_at=ds.created_at,
        updated_at=ds.updated_at,
    )


def _run_to_response(run: object) -> BenchmarkRunResponse:
    from app.models.benchmark import JobListingBenchmarkRun
    assert isinstance(run, JobListingBenchmarkRun)
    return BenchmarkRunResponse(
        id=run.id,
        job_listing_id=run.job_listing_id,
        run_type=run.run_type,
        status=run.status,
        created_by=run.created_by,
        completed_at=run.completed_at,
        input_params_json=run.input_params_json,
        result_summary_json=run.result_summary_json,
        confidence_score=run.confidence_score,
        created_at=run.created_at,
        updated_at=run.updated_at,
        matches=[
            BenchmarkMatchResponse(
                id=m.id,
                dataset_id=m.dataset_id,
                source_type=m.source_type,
                matched_title=m.matched_title,
                matched_level=m.matched_level,
                matched_location=m.matched_location,
                base_salary=m.base_salary,
                total_compensation=m.total_compensation,
                currency=m.currency,
                percentile=m.percentile,
                citation_url=m.citation_url,
                source_file_reference=m.source_file_reference,
                confidence_score=m.confidence_score,
                match_rationale=m.match_rationale,
            )
            for m in run.matches
        ],
        recommendation=_rec_to_response(run.recommendation) if run.recommendation else None,
    )


def _rec_to_response(rec: object) -> RecommendationResponse:
    from app.models.benchmark import BenchmarkRecommendation
    assert isinstance(rec, BenchmarkRecommendation)
    return RecommendationResponse(
        id=rec.id,
        job_listing_id=rec.job_listing_id,
        benchmark_run_id=rec.benchmark_run_id,
        recommended_base_min=rec.recommended_base_min,
        recommended_base_mid=rec.recommended_base_mid,
        recommended_base_max=rec.recommended_base_max,
        recommended_total_comp_min=rec.recommended_total_comp_min,
        recommended_total_comp_mid=rec.recommended_total_comp_mid,
        recommended_total_comp_max=rec.recommended_total_comp_max,
        bonus_target=rec.bonus_target,
        equity_guidance=rec.equity_guidance,
        currency=rec.currency,
        location_basis=rec.location_basis,
        confidence_score=rec.confidence_score,
        rationale=rec.rationale,
        caveats=rec.caveats,
        source_references_json=rec.source_references_json,
        applied_to_listing=rec.applied_to_listing,
        applied_at=rec.applied_at,
        applied_by=rec.applied_by,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
    )


# ── Dataset endpoints ─────────────────────────────────────────────────────────

@router.get("/datasets", response_model=list[DatasetResponse])
def list_datasets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DatasetResponse]:
    svc = BenchmarkService(db)
    return [_dataset_to_response(ds) for ds in svc.list_datasets(current_user.tenant_id)]


@router.post("/datasets", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: Annotated[UploadFile, File(description="CSV/XLSX file to upload")],
    source_type: Annotated[str, Form()] = "internal_hibob",
    dataset_name: Annotated[str, Form()] = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DatasetResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    extension = f".{file.filename.rsplit('.', 1)[-1].lower()}" if "." in file.filename else ""
    if extension not in _ALLOWED_DATASET_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type. Only .csv and .xlsx are accepted")

    if file.content_type and file.content_type.lower() not in _ALLOWED_DATASET_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {file.content_type}")

    content = await file.read()
    if len(content) > _MAX_CSV_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    valid_source_types = {
        "internal_hibob", "internal_other_hris", "talentup", "external_upload", "other"
    }
    if source_type not in valid_source_types:
        raise HTTPException(status_code=400, detail=f"Invalid source_type. Must be one of: {valid_source_types}")

    name = dataset_name.strip() or file.filename.rsplit(".", 1)[0]

    try:
        svc = BenchmarkService(db)
        ds = svc.parse_and_store_dataset(
            content=content,
            filename=file.filename,
            source_type=source_type,
            dataset_name=name,
            uploaded_by_id=current_user.id,
            tenant_id=current_user.tenant_id,
        )
        db.commit()
        return _dataset_to_response(ds)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=f"Failed to parse dataset file: {exc}") from exc


@router.patch("/datasets/{dataset_id}/mapping", response_model=DatasetResponse)
def update_dataset_mapping(
    dataset_id: uuid.UUID,
    payload: DatasetMappingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DatasetResponse:
    try:
        svc = BenchmarkService(db)
        ds = svc.update_column_mapping(dataset_id, payload.mapping, current_user.tenant_id)
        db.commit()
        return _dataset_to_response(ds)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/datasets/{dataset_id}/rows", response_model=DatasetRowsResponse)
def get_dataset_rows(
    dataset_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DatasetRowsResponse:
    try:
        svc = BenchmarkService(db)
        total, rows = svc.get_dataset_rows(dataset_id, current_user.tenant_id, limit=limit, offset=offset)
        return DatasetRowsResponse(
            dataset_id=dataset_id,
            total=total,
            rows=[
                DatasetRowPreview(
                    id=r.id,
                    normalized_title=r.normalized_title,
                    normalized_level=r.normalized_level,
                    department=r.department,
                    location=r.location,
                    currency=r.currency,
                    base_salary=r.base_salary,
                    total_compensation=r.total_compensation,
                )
                for r in rows
            ],
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def deactivate_dataset(
    dataset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    try:
        svc = BenchmarkService(db)
        svc.deactivate_dataset(dataset_id, current_user.tenant_id)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ── Benchmark run endpoints ───────────────────────────────────────────────────

@router.get("/runs", response_model=list[BenchmarkRunResponse])
def list_runs(
    listing_id: uuid.UUID = Query(..., description="Job listing ID to filter runs"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BenchmarkRunResponse]:
    svc = BenchmarkService(db)
    return [_run_to_response(r) for r in svc.list_runs(listing_id, current_user.tenant_id)]


@router.get("/runs/{run_id}", response_model=BenchmarkRunResponse)
def get_run(
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BenchmarkRunResponse:
    svc = BenchmarkService(db)
    run = svc.get_run(run_id, current_user.tenant_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Benchmark run not found")
    return _run_to_response(run)


@router.post("/runs/internal", response_model=BenchmarkRunResponse, status_code=status.HTTP_201_CREATED)
async def run_internal_benchmark(
    payload: RunInternalBenchmarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BenchmarkRunResponse:
    try:
        svc = BenchmarkService(db)
        run = await svc.run_internal_benchmark(
            job_listing_id=payload.job_listing_id,
            dataset_ids=payload.dataset_ids,
            minimum_cohort=payload.minimum_cohort,
            suppress_exact=payload.suppress_exact_below_cohort,
            created_by_id=current_user.id,
            tenant_id=current_user.tenant_id,
        )
        db.commit()
        db.refresh(run)
        return _run_to_response(run)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Benchmark failed: {exc}") from exc


@router.post("/runs/external", response_model=BenchmarkRunResponse, status_code=status.HTTP_201_CREATED)
async def run_external_benchmark(
    payload: RunExternalBenchmarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BenchmarkRunResponse:
    try:
        svc = BenchmarkService(db)
        run = await svc.run_external_benchmark(
            job_listing_id=payload.job_listing_id,
            sources=payload.sources,
            dataset_ids=payload.dataset_ids,
            search_params=payload.search_params,
            created_by_id=current_user.id,
            tenant_id=current_user.tenant_id,
        )
        db.commit()
        db.refresh(run)
        return _run_to_response(run)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Benchmark failed: {exc}") from exc


# ── Recommendation chat ───────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def benchmark_chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    try:
        svc = BenchmarkService(db)
        message, recommendation = await svc.chat_recommendation(
            job_listing_id=payload.job_listing_id,
            run_ids=payload.run_ids,
            messages=[{"role": m.role, "content": m.content} for m in payload.messages],
            tenant_id=current_user.tenant_id,
        )
        db.commit()
        return ChatResponse(
            message=message,
            recommendation=_rec_to_response(recommendation) if recommendation else None,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Chat failed: {exc}") from exc


# ── Apply recommendation ──────────────────────────────────────────────────────

@router.post(
    "/recommendations/{recommendation_id}/apply",
    response_model=RecommendationResponse,
)
def apply_recommendation(
    recommendation_id: uuid.UUID,
    payload: ApplyRecommendationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecommendationResponse:
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Must set confirm=true to apply the recommendation")
    try:
        svc = BenchmarkService(db)
        svc.apply_recommendation(recommendation_id, current_user.id, current_user.tenant_id)
        db.commit()

        # Re-fetch the recommendation to return updated state
        from app.models.benchmark import BenchmarkRecommendation
        from sqlalchemy import select
        rec = db.scalar(select(BenchmarkRecommendation).where(BenchmarkRecommendation.id == recommendation_id))
        if rec is None:
            raise HTTPException(status_code=404, detail="Recommendation not found after apply")
        return _rec_to_response(rec)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
