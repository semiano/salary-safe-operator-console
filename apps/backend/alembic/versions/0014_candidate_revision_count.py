"""Add revision_count to candidate_applications for one-time candidate revision.

Revision ID: 0014_revision_count
Revises: 0013_global_settings
Create Date: 2026-06-16 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0014_revision_count"
down_revision = "0013_global_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'candidate_applications' AND column_name = 'revision_count'"
        )
    )
    if result.fetchone() is None:
        op.add_column(
            "candidate_applications",
            sa.Column("revision_count", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    op.drop_column("candidate_applications", "revision_count")
