"""automation fire-audit columns

Revision ID: 0034
Revises: 0033
Create Date: 2026-07-07

Minimal fire-audit surface (PLAN v13.1): last_fired_at / fired_count, updated
atomically inside the firing transaction so the counters commit or roll back
with the change that fired the rule. The action vocabulary is NOT widened here
— set_assignee is deferred until a per-WP execution log exists (R1-⑤).
"""

import sqlalchemy as sa

from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "automation_rules", sa.Column("last_fired_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "automation_rules",
        sa.Column("fired_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops fire-audit data.
    op.drop_column("automation_rules", "fired_count")
    op.drop_column("automation_rules", "last_fired_at")
