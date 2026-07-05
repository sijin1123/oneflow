"""cost tracking: cost_entries + projects.budget

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("budget", sa.Numeric(14, 2), nullable=True))
    op.create_table(
        "cost_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("work_package_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("spent_on", sa.Date(), nullable=False),
        sa.Column("comment", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["work_package_id"], ["work_packages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "amount > 0 AND amount <= 100000000", name="ck_cost_entries_amount_range"
        ),
        sa.CheckConstraint(
            "kind IN ('labor', 'material', 'other')", name="ck_cost_entries_kind_allowed"
        ),
    )
    op.create_index("ix_cost_entries_wp", "cost_entries", ["work_package_id", "spent_on"])


def downgrade() -> None:
    op.drop_table("cost_entries")
    op.drop_column("projects", "budget")
