"""Add token, candidate_email, candidate_name to phase1_bids

Revision ID: 0004_bid_invitation_tokens
Revises: 0003_phase1_bid_received_at
Create Date: 2025-01-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0004_bid_invitation_tokens"
down_revision = "0003_phase1_bid_received_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add token column: UUID, unique, generated server-side
    op.add_column(
        "phase1_bids",
        sa.Column(
            "token",
            UUID(as_uuid=True),
            nullable=True,  # nullable initially so existing rows don't fail
        ),
    )
    # Populate existing rows with random UUIDs via SQL
    op.execute("UPDATE phase1_bids SET token = gen_random_uuid() WHERE token IS NULL")
    # Now make it NOT NULL and unique
    op.alter_column("phase1_bids", "token", nullable=False)
    op.create_unique_constraint("uq_phase1_bids_token", "phase1_bids", ["token"])

    op.add_column(
        "phase1_bids",
        sa.Column("candidate_email", sa.String(255), nullable=True),
    )
    op.add_column(
        "phase1_bids",
        sa.Column("candidate_name", sa.String(255), nullable=True),
    )
    # Track whether this is an invitation (sent out) vs a directly created bid
    op.add_column(
        "phase1_bids",
        sa.Column("is_invitation", sa.Boolean(), server_default="false", nullable=False),
    )
    # candidate_submitted_at: null until candidate fills out the form
    op.add_column(
        "phase1_bids",
        sa.Column("candidate_submitted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("phase1_bids", "candidate_submitted_at")
    op.drop_column("phase1_bids", "is_invitation")
    op.drop_column("phase1_bids", "candidate_name")
    op.drop_column("phase1_bids", "candidate_email")
    op.drop_constraint("uq_phase1_bids_token", "phase1_bids", type_="unique")
    op.drop_column("phase1_bids", "token")
