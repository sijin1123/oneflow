"""private Workspace Home quick links

Revision ID: 0102
Revises: 0101
Create Date: 2026-07-17
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0102"
down_revision = "0101"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_quick_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=80), nullable=False),
        sa.Column("destination", sa.String(length=2048), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("version", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("char_length(title) BETWEEN 1 AND 80", name="title_length"),
        sa.CheckConstraint(
            "char_length(destination) BETWEEN 1 AND 2048", name="destination_length"
        ),
        sa.CheckConstraint("position >= 0", name="position_nonnegative"),
        sa.CheckConstraint("version >= 0", name="version_nonnegative"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_workspace_quick_links_user_position",
        "workspace_quick_links",
        ["user_id", "position"],
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_quick_links_user_position", table_name="workspace_quick_links")
    op.drop_table("workspace_quick_links")
