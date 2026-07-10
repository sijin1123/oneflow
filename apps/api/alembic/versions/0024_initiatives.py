"""initiatives + initiative_projects

Revision ID: 0024
Revises: 0023
Create Date: 2026-07-07

Additive (two new tables) — forward-only in production. Downgrade drops both
(dev/CI smoke only; initiative data is lost).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "initiatives",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=True),
        sa.Column("state", sa.String(20), nullable=False, server_default="planned"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="SET NULL"),
        # Short names — the naming convention adds the ck_initiatives_ prefix.
        sa.CheckConstraint(
            "state IN ('planned', 'in_progress', 'paused', 'completed', 'cancelled')",
            name="state_allowed",
        ),
        sa.CheckConstraint(
            "start_date IS NULL OR target_date IS NULL OR start_date <= target_date",
            name="date_order",
        ),
    )
    op.create_index("ix_initiatives_owner", "initiatives", ["owner_id"])

    op.create_table(
        "initiative_projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("initiative_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["initiative_id"], ["initiatives.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("initiative_id", "project_id", name="uq_initiative_projects_pair"),
    )
    op.create_index("ix_initiative_projects_project", "initiative_projects", ["project_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops all initiative data.
    op.drop_index("ix_initiative_projects_project", table_name="initiative_projects")
    op.drop_table("initiative_projects")
    op.drop_index("ix_initiatives_owner", table_name="initiatives")
    op.drop_table("initiatives")
