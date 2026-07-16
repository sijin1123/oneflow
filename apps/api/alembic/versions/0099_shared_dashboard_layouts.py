"""project shared dashboard layouts

Revision ID: 0099
Revises: 0098
Create Date: 2026-07-17
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0099"
down_revision = "0098"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dashboard_shared_layouts",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("widgets", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by_name", sa.String(length=120), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "jsonb_typeof(widgets) = 'array' AND jsonb_array_length(widgets) >= 1 "
            'AND widgets <@ \'["summary", "budget", "progress", '
            '"status_distribution", "priority_distribution", '
            '"type_distribution", "recent_activity"]\'::jsonb',
            name=op.f("ck_dashboard_shared_layouts_widgets_valid"),
        ),
        sa.CheckConstraint(
            "version >= 1",
            name=op.f("ck_dashboard_shared_layouts_version_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_dashboard_shared_layouts_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            name=op.f("fk_dashboard_shared_layouts_updated_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint(
            "project_id",
            name=op.f("pk_dashboard_shared_layouts"),
        ),
    )


def downgrade() -> None:
    op.drop_table("dashboard_shared_layouts")
