"""add phase1 bids

Revision ID: 0002_phase1_bids
Revises: 0001_initial_schema
Create Date: 2026-04-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0002_phase1_bids"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "phase1_bids",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("applicant_identifier", sa.String(length=255), nullable=False),
        sa.Column("salary_min", sa.Float(), nullable=False),
        sa.Column("salary_max", sa.Float(), nullable=False),
        sa.Column("insurance_importance_rank", sa.Integer(), nullable=False),
        sa.Column("pto_importance_rank", sa.Integer(), nullable=False),
        sa.Column("wfh_importance_rank", sa.Integer(), nullable=False),
        sa.Column("submission_status", sa.String(length=50), server_default=sa.text("'applicant_bid_submitted'"), nullable=False),
        sa.Column("decision_status", sa.String(length=20), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("response_message", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("salary_max >= salary_min", name="ck_phase1_bids_salary_range"),
        sa.CheckConstraint("insurance_importance_rank between 1 and 3", name="ck_phase1_bids_insurance_rank"),
        sa.CheckConstraint("pto_importance_rank between 1 and 3", name="ck_phase1_bids_pto_rank"),
        sa.CheckConstraint("wfh_importance_rank between 1 and 3", name="ck_phase1_bids_wfh_rank"),
        sa.ForeignKeyConstraint(["case_id"], ["negotiation_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_phase1_bids_case_id"), "phase1_bids", ["case_id"], unique=False)
    op.create_index(op.f("ix_phase1_bids_submission_status"), "phase1_bids", ["submission_status"], unique=False)
    op.create_index(op.f("ix_phase1_bids_decision_status"), "phase1_bids", ["decision_status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_phase1_bids_decision_status"), table_name="phase1_bids")
    op.drop_index(op.f("ix_phase1_bids_submission_status"), table_name="phase1_bids")
    op.drop_index(op.f("ix_phase1_bids_case_id"), table_name="phase1_bids")
    op.drop_table("phase1_bids")
