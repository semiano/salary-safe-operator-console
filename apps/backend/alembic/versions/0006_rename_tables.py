"""Rename tables: negotiation_cases→job_listings, case_parties→job_listing_parties, phase1_bids→candidate_applications

Revision ID: 0006_rename_tables
Revises: 0005_case_operator_guidance
Create Date: 2026-05-13 00:00:00.000000
"""

from alembic import op

revision = "0006_rename_tables"
down_revision = "0005_case_operator_guidance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("negotiation_cases", "job_listings")
    op.rename_table("case_parties", "job_listing_parties")
    op.rename_table("phase1_bids", "candidate_applications")


def downgrade() -> None:
    op.rename_table("job_listings", "negotiation_cases")
    op.rename_table("job_listing_parties", "case_parties")
    op.rename_table("candidate_applications", "phase1_bids")
