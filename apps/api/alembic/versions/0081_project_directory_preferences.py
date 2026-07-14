"""project directory preferences

Revision ID: 0081
Revises: 0080
Create Date: 2026-07-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0081"
down_revision = "0080"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_project_directory_preferences",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("columns", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("sort_key", sa.String(length=32), nullable=False),
        sa.Column("sort_direction", sa.String(length=4), nullable=False),
        sa.Column("layout", sa.String(length=8), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "jsonb_typeof(columns) = 'array' AND columns <@ "
            '\'["initiatives", "work_package_count", "open_work_package_count", '
            '"overdue_count", "member_count"]\'::jsonb',
            name="columns_valid",
        ),
        sa.CheckConstraint(
            "sort_key IN ('default', 'name', 'work_package_count', "
            "'open_work_package_count', 'overdue_count', 'member_count', 'health')",
            name="sort_key_valid",
        ),
        sa.CheckConstraint(
            "sort_direction IN ('asc', 'desc')",
            name="sort_direction_valid",
        ),
        sa.CheckConstraint("layout IN ('grid', 'list')", name="layout_valid"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_user_project_directory_preferences_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name="pk_user_project_directory_preferences"),
    )


def downgrade() -> None:
    op.drop_table("user_project_directory_preferences")
