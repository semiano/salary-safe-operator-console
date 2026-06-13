"""Create global settings table and seed auto-accept match threshold.

Revision ID: 0013_global_settings
Revises: 0012_bid_history_events
Create Date: 2026-06-13 00:00:00.000000
"""

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0013_global_settings"
down_revision = "0012_bid_history_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "global_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("setting_key", sa.String(length=120), nullable=False),
        sa.Column("value_json", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_global_settings_setting_key", "global_settings", ["setting_key"], unique=True)

    bind = op.get_bind()
    bind.execute(
        sa.text(
            "INSERT INTO global_settings (id, setting_key, value_json) "
            "VALUES (:id, :setting_key, CAST(:value_json AS jsonb))"
        ),
        {
            "id": str(uuid.uuid4()),
            "setting_key": "auto_accept_match_threshold",
            "value_json": '{"value": 87}',
        },
    )


def downgrade() -> None:
    op.drop_index("ix_global_settings_setting_key", table_name="global_settings")
    op.drop_table("global_settings")
