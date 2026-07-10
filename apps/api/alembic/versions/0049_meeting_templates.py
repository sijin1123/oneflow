"""meeting_agenda_templates

Revision ID: 0049
Revises: 0048
Create Date: 2026-07-08

Project-scoped named agenda snapshots (Pass 48). Name is case-sensitive
unique per project (the saved_filters policy); created_by survives user
deletion via SET NULL; templates die with their project (CASCADE). Applying
a template COPIES its agenda at meeting-create time — later template edits
(delete + recreate; no PATCH) never touch existing meetings.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meeting_agenda_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("agenda", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("project_id", "name", name="uq_meeting_templates_project_name"),
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops every template.
    op.drop_table("meeting_agenda_templates")
