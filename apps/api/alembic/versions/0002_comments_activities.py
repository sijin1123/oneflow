"""comments and activity history

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-05

Clean-room note: schema authored from OneFlow's own design (PLAN §3 Phase 1
follow-up) — no reference-product schema was consulted.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "work_package_comments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("work_package_id", UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", UUID(as_uuid=True), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["work_package_id"], ["work_packages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_comments_wp_created", "work_package_comments", ["work_package_id", "created_at"]
    )

    op.create_table(
        "activities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("work_package_id", UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("field", sa.String(40), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["work_package_id"], ["work_packages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "action IN ('created', 'field_changed', 'commented')",
            name="ck_activities_action_allowed",
        ),
    )
    op.create_index("ix_activities_wp_created", "activities", ["work_package_id", "created_at"])


def downgrade() -> None:
    op.drop_table("activities")
    op.drop_table("work_package_comments")
