"""automation_rules

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "automation_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("trigger_type", sa.String(30), nullable=False),
        sa.Column("trigger_value", sa.String(30), nullable=False),
        sa.Column("action_type", sa.String(30), nullable=False),
        sa.Column("action_value", sa.String(30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "trigger_type IN ('status_changed_to')", name="automation_trigger_allowed"
        ),
        sa.CheckConstraint("action_type IN ('set_priority')", name="automation_action_allowed"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_automation_rules_project", "automation_rules", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_automation_rules_project", table_name="automation_rules")
    op.drop_table("automation_rules")
