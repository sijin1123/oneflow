"""automation_rules: explicit priority position

Revision ID: 0060
Revises: 0059
Create Date: 2026-07-09

Owner-controlled priority (Pass 82). A NOT NULL position column (server_default
0) is backfilled per project by (created_at, id) row_number so existing rules
get a normalized 0..n-1 order that preserves their current created_at-based
precedence (v82.1 R1-①).
"""

import sqlalchemy as sa

from alembic import op

revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "automation_rules",
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )
    # Backfill 0..n-1 per project in the existing created_at, id order.
    op.execute(
        """
        UPDATE automation_rules AS a
        SET position = ranked.rn - 1
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY project_id ORDER BY created_at ASC, id ASC
                   ) AS rn
            FROM automation_rules
        ) AS ranked
        WHERE a.id = ranked.id
        """
    )


def downgrade() -> None:
    op.drop_column("automation_rules", "position")
