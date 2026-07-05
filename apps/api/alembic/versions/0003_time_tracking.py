"""time tracking: time_entries + work_packages.estimated_hours

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "work_packages",
        sa.Column("estimated_hours", sa.Numeric(6, 2), nullable=True),
    )
    op.create_table(
        "time_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("work_package_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("hours", sa.Numeric(6, 2), nullable=False),
        sa.Column("spent_on", sa.Date(), nullable=False),
        sa.Column("comment", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["work_package_id"], ["work_packages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("hours > 0 AND hours <= 1000", name="ck_time_entries_hours_range"),
    )
    op.create_index("ix_time_entries_wp", "time_entries", ["work_package_id", "spent_on"])


def downgrade() -> None:
    op.drop_table("time_entries")
    op.drop_column("work_packages", "estimated_hours")
