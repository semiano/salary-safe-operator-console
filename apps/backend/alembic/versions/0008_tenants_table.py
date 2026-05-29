"""Create tenants table

Revision ID: 0008_tenants_table
Revises: 0007_invitation_code
Create Date: 2026-06-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0008_tenants_table"
down_revision = "0007_invitation_code"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenants (
            id UUID DEFAULT gen_random_uuid() NOT NULL,
            alias VARCHAR(80) NOT NULL,
            slug VARCHAR(40) NOT NULL,
            plan VARCHAR(40) NOT NULL DEFAULT 'free',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            UNIQUE (alias),
            UNIQUE (slug)
        )
    """)

    # Insert default tenant used for all existing data
    op.execute(
        """
        INSERT INTO tenants (id, alias, slug, plan)
        VALUES (
            '00000000-0000-0000-0000-000000000001',
            'Default Organisation',
            'default',
            'free'
        )
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("tenants")
