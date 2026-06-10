"""Create benchmark tables: datasets, dataset_rows, benchmark_runs, matches, recommendations

Revision ID: 0011_benchmark_tables
Revises: 0010_match_score
Create Date: 2026-06-03 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0011_benchmark_tables"
down_revision = "0010_match_score"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── benchmark_datasets ────────────────────────────────────────────────────
    op.create_table(
        "benchmark_datasets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("dataset_name", sa.Text, nullable=False),
        sa.Column("original_filename", sa.Text, nullable=False),
        sa.Column("uploaded_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("row_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("column_mapping_json", JSONB, nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="uploaded"),
        sa.Column("is_global", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_benchmark_datasets_tenant_id", "benchmark_datasets", ["tenant_id"])

    # ── benchmark_dataset_rows ────────────────────────────────────────────────
    op.create_table(
        "benchmark_dataset_rows",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "dataset_id",
            UUID(as_uuid=True),
            sa.ForeignKey("benchmark_datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("normalized_title", sa.Text, nullable=True),
        sa.Column("normalized_level", sa.Text, nullable=True),
        sa.Column("department", sa.Text, nullable=True),
        sa.Column("location", sa.Text, nullable=True),
        sa.Column("country", sa.String(10), nullable=True),
        sa.Column("currency", sa.String(10), nullable=True),
        sa.Column("base_salary", sa.Float, nullable=True),
        sa.Column("total_compensation", sa.Float, nullable=True),
        sa.Column("bonus", sa.Float, nullable=True),
        sa.Column("equity", sa.Float, nullable=True),
        sa.Column("effective_date", sa.String(50), nullable=True),
        sa.Column("raw_row_json", JSONB, nullable=False),
    )
    op.create_index("ix_benchmark_dataset_rows_dataset_id", "benchmark_dataset_rows", ["dataset_id"])

    # ── job_listing_benchmark_runs ────────────────────────────────────────────
    op.create_table(
        "job_listing_benchmark_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "job_listing_id",
            UUID(as_uuid=True),
            sa.ForeignKey("job_listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("run_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("input_params_json", JSONB, nullable=True),
        sa.Column("result_summary_json", JSONB, nullable=True),
        sa.Column("confidence_score", sa.Float, nullable=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_job_listing_benchmark_runs_job_listing_id", "job_listing_benchmark_runs", ["job_listing_id"])
    op.create_index("ix_job_listing_benchmark_runs_tenant_id", "job_listing_benchmark_runs", ["tenant_id"])

    # ── benchmark_matches ─────────────────────────────────────────────────────
    op.create_table(
        "benchmark_matches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "benchmark_run_id",
            UUID(as_uuid=True),
            sa.ForeignKey("job_listing_benchmark_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "dataset_id",
            UUID(as_uuid=True),
            sa.ForeignKey("benchmark_datasets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("matched_title", sa.Text, nullable=True),
        sa.Column("matched_level", sa.Text, nullable=True),
        sa.Column("matched_location", sa.Text, nullable=True),
        sa.Column("base_salary", sa.Float, nullable=True),
        sa.Column("total_compensation", sa.Float, nullable=True),
        sa.Column("currency", sa.String(10), nullable=True),
        sa.Column("percentile", sa.String(20), nullable=True),
        sa.Column("citation_url", sa.Text, nullable=True),
        sa.Column("source_file_reference", sa.Text, nullable=True),
        sa.Column("confidence_score", sa.Float, nullable=True),
        sa.Column("match_rationale", sa.Text, nullable=True),
        sa.Column("raw_evidence_json", JSONB, nullable=True),
    )
    op.create_index("ix_benchmark_matches_benchmark_run_id", "benchmark_matches", ["benchmark_run_id"])

    # ── benchmark_recommendations ─────────────────────────────────────────────
    op.create_table(
        "benchmark_recommendations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "job_listing_id",
            UUID(as_uuid=True),
            sa.ForeignKey("job_listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "benchmark_run_id",
            UUID(as_uuid=True),
            sa.ForeignKey("job_listing_benchmark_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("recommended_base_min", sa.Float, nullable=True),
        sa.Column("recommended_base_mid", sa.Float, nullable=True),
        sa.Column("recommended_base_max", sa.Float, nullable=True),
        sa.Column("recommended_total_comp_min", sa.Float, nullable=True),
        sa.Column("recommended_total_comp_mid", sa.Float, nullable=True),
        sa.Column("recommended_total_comp_max", sa.Float, nullable=True),
        sa.Column("bonus_target", sa.Float, nullable=True),
        sa.Column("equity_guidance", sa.Text, nullable=True),
        sa.Column("currency", sa.String(10), nullable=True),
        sa.Column("location_basis", sa.Text, nullable=True),
        sa.Column("confidence_score", sa.Float, nullable=True),
        sa.Column("rationale", sa.Text, nullable=True),
        sa.Column("caveats", sa.Text, nullable=True),
        sa.Column("source_references_json", JSONB, nullable=True),
        sa.Column("applied_to_listing", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_benchmark_recommendations_job_listing_id", "benchmark_recommendations", ["job_listing_id"]
    )


def downgrade() -> None:
    op.drop_table("benchmark_recommendations")
    op.drop_table("benchmark_matches")
    op.drop_table("job_listing_benchmark_runs")
    op.drop_table("benchmark_dataset_rows")
    op.drop_table("benchmark_datasets")
