from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ── Dataset schemas ───────────────────────────────────────────────────────────

class DatasetResponse(BaseModel):
    id: UUID
    source_type: str
    dataset_name: str
    original_filename: str
    uploaded_by: UUID | None
    row_count: int
    column_mapping_json: dict[str, Any] | None
    status: str
    is_global: bool
    is_active: bool
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime


class DatasetMappingRequest(BaseModel):
    """Column mapping: canonical_name -> actual CSV header."""
    mapping: dict[str, str] = Field(
        description="Keys are canonical names (title, level, department, location, currency, base_salary, "
        "total_compensation, bonus, equity, effective_date). Values are CSV column headers."
    )


class DatasetRowPreview(BaseModel):
    id: UUID
    normalized_title: str | None
    normalized_level: str | None
    department: str | None
    location: str | None
    currency: str | None
    base_salary: float | None
    total_compensation: float | None


class DatasetRowsResponse(BaseModel):
    dataset_id: UUID
    total: int
    rows: list[DatasetRowPreview]


# ── Benchmark run schemas ─────────────────────────────────────────────────────

class RunInternalBenchmarkRequest(BaseModel):
    job_listing_id: UUID
    dataset_ids: list[UUID] = Field(default_factory=list)
    minimum_cohort: int = Field(default=5, ge=1, le=100)
    suppress_exact_below_cohort: bool = Field(default=True)


class RunExternalBenchmarkRequest(BaseModel):
    job_listing_id: UUID
    sources: list[str] = Field(
        default_factory=lambda: ["web_search"],
        description="Sources to run: web_search, talentup_csv, other_upload",
    )
    dataset_ids: list[UUID] = Field(default_factory=list, description="External dataset IDs to search against")
    search_params: dict[str, Any] = Field(default_factory=dict)


class BenchmarkMatchResponse(BaseModel):
    id: UUID
    dataset_id: UUID | None
    source_type: str
    matched_title: str | None
    matched_level: str | None
    matched_location: str | None
    base_salary: float | None
    total_compensation: float | None
    currency: str | None
    percentile: str | None
    citation_url: str | None
    source_file_reference: str | None
    confidence_score: float | None
    match_rationale: str | None


class BenchmarkRunResponse(BaseModel):
    id: UUID
    job_listing_id: UUID
    run_type: str
    status: str
    created_by: UUID | None
    completed_at: datetime | None
    input_params_json: dict[str, Any] | None
    result_summary_json: dict[str, Any] | None
    confidence_score: float | None
    created_at: datetime
    updated_at: datetime
    matches: list[BenchmarkMatchResponse] = Field(default_factory=list)
    recommendation: "RecommendationResponse | None" = None


# ── Recommendation schemas ────────────────────────────────────────────────────

class RecommendationResponse(BaseModel):
    id: UUID
    job_listing_id: UUID
    benchmark_run_id: UUID
    recommended_base_min: float | None
    recommended_base_mid: float | None
    recommended_base_max: float | None
    recommended_total_comp_min: float | None
    recommended_total_comp_mid: float | None
    recommended_total_comp_max: float | None
    bonus_target: float | None
    equity_guidance: str | None
    currency: str | None
    location_basis: str | None
    confidence_score: float | None
    rationale: str | None
    caveats: str | None
    source_references_json: list[Any] | None
    applied_to_listing: bool
    applied_at: datetime | None
    applied_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ApplyRecommendationRequest(BaseModel):
    confirm: bool = Field(description="Must be True to confirm the update")


# ── Chat schemas ──────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str = Field(description="user or assistant")
    content: str


class ChatRequest(BaseModel):
    job_listing_id: UUID
    run_ids: list[UUID] = Field(default_factory=list, description="Internal and/or external run IDs to ground the chat")
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    message: str
    recommendation: RecommendationResponse | None = None


# Needed for forward-ref resolution
BenchmarkRunResponse.model_rebuild()
