"""Create candidate application event history table.

Revision ID: 0012_bid_history_events
Revises: 0011_benchmark_tables
Create Date: 2026-06-11 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0012_bid_history_events"
down_revision = "0011_benchmark_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "candidate_application_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "bid_id",
            UUID(as_uuid=True),
            sa.ForeignKey("candidate_applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "case_id",
            UUID(as_uuid=True),
            sa.ForeignKey("job_listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("detail", sa.Text, nullable=True),
        sa.Column("payload_json", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_candidate_application_events_bid_id", "candidate_application_events", ["bid_id"])
    op.create_index("ix_candidate_application_events_case_id", "candidate_application_events", ["case_id"])
    op.create_index("ix_candidate_application_events_tenant_id", "candidate_application_events", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("candidate_application_events")
