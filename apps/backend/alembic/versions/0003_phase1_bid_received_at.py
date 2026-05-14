"""add received_at to phase1 bids

Revision ID: 0003_phase1_bid_received_at
Revises: 0002_phase1_bids
Create Date: 2026-04-29
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0003_phase1_bid_received_at"
down_revision = "0002_phase1_bids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "phase1_bids",
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
    )
    op.execute("UPDATE phase1_bids SET received_at = created_at WHERE received_at IS NULL")
    op.alter_column("phase1_bids", "received_at", nullable=False)


def downgrade() -> None:
    op.drop_column("phase1_bids", "received_at")
