"""saved_filters

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_filters",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("params", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", "user_id", "name", name="uq_saved_filter_name"),
    )
    op.create_index("ix_saved_filters_project_user", "saved_filters", ["project_id", "user_id"])


def downgrade() -> None:
    op.drop_index("ix_saved_filters_project_user", table_name="saved_filters")
    op.drop_table("saved_filters")
