import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class BenchmarkDataset(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "benchmark_datasets"

    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    dataset_name: Mapped[str] = mapped_column(Text, nullable=False)
    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    column_mapping_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, server_default="uploaded")
    is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    rows: Mapped[list["BenchmarkDatasetRow"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class BenchmarkDatasetRow(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "benchmark_dataset_rows"

    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("benchmark_datasets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    normalized_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_level: Mapped[str | None] = mapped_column(Text, nullable=True)
    department: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    country: Mapped[str | None] = mapped_column(String(10), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    base_salary: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_compensation: Mapped[float | None] = mapped_column(Float, nullable=True)
    bonus: Mapped[float | None] = mapped_column(Float, nullable=True)
    equity: Mapped[float | None] = mapped_column(Float, nullable=True)
    effective_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    raw_row_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    dataset: Mapped["BenchmarkDataset"] = relationship(back_populates="rows")


class JobListingBenchmarkRun(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "job_listing_benchmark_runs"

    job_listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_listings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    run_type: Mapped[str] = mapped_column(String(50), nullable=False)  # internal | external | recommendation
    status: Mapped[str] = mapped_column(String(50), nullable=False, server_default="pending")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    input_params_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    result_summary_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    matches: Mapped[list["BenchmarkMatch"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )
    recommendation: Mapped["BenchmarkRecommendation | None"] = relationship(
        back_populates="run", uselist=False, cascade="all, delete-orphan"
    )


class BenchmarkMatch(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "benchmark_matches"

    benchmark_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_listing_benchmark_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("benchmark_datasets.id", ondelete="SET NULL"), nullable=True
    )
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    matched_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    matched_level: Mapped[str | None] = mapped_column(Text, nullable=True)
    matched_location: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_salary: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_compensation: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    percentile: Mapped[str | None] = mapped_column(String(20), nullable=True)
    citation_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_file_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    match_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_evidence_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    run: Mapped["JobListingBenchmarkRun"] = relationship(back_populates="matches")


class BenchmarkRecommendation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "benchmark_recommendations"

    job_listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_listings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    benchmark_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_listing_benchmark_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    recommended_base_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    recommended_base_mid: Mapped[float | None] = mapped_column(Float, nullable=True)
    recommended_base_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    recommended_total_comp_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    recommended_total_comp_mid: Mapped[float | None] = mapped_column(Float, nullable=True)
    recommended_total_comp_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    bonus_target: Mapped[float | None] = mapped_column(Float, nullable=True)
    equity_guidance: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    location_basis: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    caveats: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_references_json: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)
    applied_to_listing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    applied_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    run: Mapped["JobListingBenchmarkRun"] = relationship(back_populates="recommendation")
