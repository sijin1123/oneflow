"""project phase gates

Revision ID: 0087
Revises: 0086
Create Date: 2026-07-15
"""

import sqlalchemy as sa

from alembic import op

revision = "0087"
down_revision = "0086"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_phases",
        sa.Column("start_gate_active", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "project_phases",
        sa.Column("finish_gate_active", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("project_phases", "finish_gate_active")
    op.drop_column("project_phases", "start_gate_active")
