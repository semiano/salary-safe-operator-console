"""Add operator_guidance to negotiation_cases

Revision ID: 0005_case_operator_guidance
Revises: 0004_bid_invitation_tokens
Create Date: 2026-05-13 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_case_operator_guidance"
down_revision = "0004_bid_invitation_tokens"
branch_labels = None
depends_on = None

_DEFAULT_GUIDANCE = (
    "Accept candidates whose target salary falls within the posted budget range. "
    "Prioritize candidates who rank health insurance as a top benefit. "
    "Reject if the target salary exceeds the budget ceiling by more than 10%. "
    "Use professional, encouraging language in all response messages."
)


def upgrade() -> None:
    # Add column as nullable first so existing rows don't fail
    op.add_column("negotiation_cases", sa.Column("operator_guidance", sa.Text(), nullable=True))
    # Backfill all existing rows with the default text
    escaped = _DEFAULT_GUIDANCE.replace("'", "''")
    op.execute(f"UPDATE negotiation_cases SET operator_guidance = '{escaped}' WHERE operator_guidance IS NULL")
    # Lock it down to NOT NULL
    op.alter_column("negotiation_cases", "operator_guidance", nullable=False)


def downgrade() -> None:
    op.drop_column("negotiation_cases", "operator_guidance")
