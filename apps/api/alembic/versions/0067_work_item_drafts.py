"""work item drafts

Revision ID: 0067
Revises: 0066
Create Date: 2026-07-10
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0067"
down_revision = "0066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "work_item_drafts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), server_default="0", nullable=False),
        sa.Column("submitted_work_package_id", sa.UUID(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("jsonb_typeof(content) = 'object'", name="content_object"),
        sa.CheckConstraint("version >= 0", name="version_nonnegative"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["submitted_work_package_id"], ["work_packages.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_work_item_drafts_owner_updated_active",
        "work_item_drafts",
        ["owner_id", sa.text("updated_at DESC")],
        postgresql_where=sa.text("submitted_at IS NULL"),
    )
    op.create_index("ix_work_item_drafts_project_id", "work_item_drafts", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_work_item_drafts_project_id", table_name="work_item_drafts")
    op.drop_index("ix_work_item_drafts_owner_updated_active", table_name="work_item_drafts")
    op.drop_table("work_item_drafts")
