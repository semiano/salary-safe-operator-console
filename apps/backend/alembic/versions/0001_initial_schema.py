"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)

    op.create_table(
        "negotiation_cases",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("jurisdiction", sa.String(length=50), nullable=True),
        sa.Column("currency", sa.String(length=10), server_default=sa.text("'USD'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "prompt_sets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("candidate_rep_prompt", sa.Text(), nullable=False),
        sa.Column("company_rep_prompt", sa.Text(), nullable=False),
        sa.Column("arbitrator_prompt", sa.Text(), nullable=False),
        sa.Column("intake_prompt", sa.Text(), nullable=False),
        sa.Column("policy_prompt", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "case_parties",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("party_type", sa.String(length=20), nullable=False),
        sa.Column("public_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("confidential_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["negotiation_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_case_parties_case_id"), "case_parties", ["case_id"], unique=False)

    op.create_table(
        "run_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("config_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["negotiation_cases.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "negotiation_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_config_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("prompt_set_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=False),
        sa.Column("orchestration_mode", sa.String(length=100), nullable=False),
        sa.Column("summary_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("final_report_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["negotiation_cases.id"]),
        sa.ForeignKeyConstraint(["prompt_set_id"], ["prompt_sets.id"]),
        sa.ForeignKeyConstraint(["run_config_id"], ["run_configs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "run_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phase", sa.String(length=50), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("speaker_agent", sa.String(length=100), nullable=False),
        sa.Column("visibility", sa.String(length=20), nullable=False),
        sa.Column("message_type", sa.String(length=50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("structured_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["negotiation_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_run_messages_run_id"), "run_messages", ["run_id"], unique=False)

    op.create_table(
        "run_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("artifact_type", sa.String(length=100), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["negotiation_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_run_artifacts_run_id"), "run_artifacts", ["run_id"], unique=False)

    op.create_table(
        "run_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("metric_name", sa.String(length=100), nullable=False),
        sa.Column("metric_value", sa.Numeric(), nullable=True),
        sa.Column("metric_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["negotiation_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_run_metrics_run_id"), "run_metrics", ["run_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_run_metrics_run_id"), table_name="run_metrics")
    op.drop_table("run_metrics")
    op.drop_index(op.f("ix_run_artifacts_run_id"), table_name="run_artifacts")
    op.drop_table("run_artifacts")
    op.drop_index(op.f("ix_run_messages_run_id"), table_name="run_messages")
    op.drop_table("run_messages")
    op.drop_table("negotiation_runs")
    op.drop_table("run_configs")
    op.drop_index(op.f("ix_case_parties_case_id"), table_name="case_parties")
    op.drop_table("case_parties")
    op.drop_table("prompt_sets")
    op.drop_table("negotiation_cases")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
