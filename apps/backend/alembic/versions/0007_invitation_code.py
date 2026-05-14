"""Add invitation_code to candidate_applications

Revision ID: 0007_invitation_code
Revises: 0006_rename_tables
Create Date: 2026-05-13 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_invitation_code"
down_revision = "0006_rename_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "candidate_applications",
        sa.Column("invitation_code", sa.String(10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("candidate_applications", "invitation_code")
