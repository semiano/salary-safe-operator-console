"""Add tenant_id FK to users, job_listings, candidate_applications

Revision ID: 0009_add_tenant_id
Revises: 0008_tenants_table
Create Date: 2026-06-01 00:00:01.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0009_add_tenant_id"
down_revision = "0008_tenants_table"
branch_labels = None
depends_on = None

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    bind = op.get_bind()

    def column_exists(table: str, column: str) -> bool:
        result = bind.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        )
        return result.fetchone() is not None

    # ── users ──────────────────────────────────────────────────────────────────
    if not column_exists("users", "tenant_id"):
        op.add_column(
            "users",
            sa.Column("tenant_id", UUID(as_uuid=True), nullable=True),
        )
        op.execute(f"UPDATE users SET tenant_id = '{DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL")
        op.alter_column("users", "tenant_id", nullable=False)
        op.create_foreign_key(
            "fk_users_tenant_id",
            "users",
            "tenants",
            ["tenant_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        op.create_index("ix_users_tenant_id", "users", ["tenant_id"])

    # ── job_listings ───────────────────────────────────────────────────────────
    if not column_exists("job_listings", "tenant_id"):
        op.add_column(
            "job_listings",
            sa.Column("tenant_id", UUID(as_uuid=True), nullable=True),
        )
        op.execute(f"UPDATE job_listings SET tenant_id = '{DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL")
        op.alter_column("job_listings", "tenant_id", nullable=False)
        op.create_foreign_key(
            "fk_job_listings_tenant_id",
            "job_listings",
            "tenants",
            ["tenant_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        op.create_index("ix_job_listings_tenant_id", "job_listings", ["tenant_id"])

    # ── candidate_applications ─────────────────────────────────────────────────
    if not column_exists("candidate_applications", "tenant_id"):
        op.add_column(
            "candidate_applications",
            sa.Column("tenant_id", UUID(as_uuid=True), nullable=True),
        )
        op.execute(
            f"""
            UPDATE candidate_applications ca
            SET tenant_id = jl.tenant_id
            FROM job_listings jl
            WHERE ca.case_id = jl.id
            """
        )
        op.execute(
            f"UPDATE candidate_applications SET tenant_id = '{DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL"
        )
        op.alter_column("candidate_applications", "tenant_id", nullable=False)
        op.create_foreign_key(
            "fk_candidate_applications_tenant_id",
            "candidate_applications",
            "tenants",
            ["tenant_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        op.create_index("ix_candidate_applications_tenant_id", "candidate_applications", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_candidate_applications_tenant_id", "candidate_applications")
    op.drop_constraint("fk_candidate_applications_tenant_id", "candidate_applications", type_="foreignkey")
    op.drop_column("candidate_applications", "tenant_id")

    op.drop_index("ix_job_listings_tenant_id", "job_listings")
    op.drop_constraint("fk_job_listings_tenant_id", "job_listings", type_="foreignkey")
    op.drop_column("job_listings", "tenant_id")

    op.drop_index("ix_users_tenant_id", "users")
    op.drop_constraint("fk_users_tenant_id", "users", type_="foreignkey")
    op.drop_column("users", "tenant_id")
