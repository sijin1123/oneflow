"""intake_items

Revision ID: 0022
Revises: 0021
Create Date: 2026-07-06

Additive (new table) — forward-only in production. Downgrade drops the table
and all intake history (dev/CI smoke only).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intake_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("submitted_by", UUID(as_uuid=True), nullable=True),
        sa.Column("snooze_until", sa.Date(), nullable=True),
        sa.Column("accepted_wp_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submitted_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["accepted_wp_id"], ["work_packages.id"], ondelete="SET NULL"),
        # Short name — the naming convention adds the ck_intake_items_ prefix.
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'snoozed', 'duplicate')",
            name="status_allowed",
        ),
    )
    op.create_index("ix_intake_items_project_status", "intake_items", ["project_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_intake_items_project_status", table_name="intake_items")
    op.drop_table("intake_items")
