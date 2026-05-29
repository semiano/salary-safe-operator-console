"""Add match_score to candidate_applications

Revision ID: 0010_match_score
Revises: 0009_add_tenant_id
Create Date: 2026-05-21 00:00:01.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_match_score"
down_revision = "0009_add_tenant_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'candidate_applications' AND column_name = 'match_score'"
        )
    )
    if result.fetchone() is None:
        op.add_column("candidate_applications", sa.Column("match_score", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("candidate_applications", "match_score")
