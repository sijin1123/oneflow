"""user_notification_settings

Revision ID: 0019
Revises: 0018
Create Date: 2026-07-06

Additive: absent row = defaults (all True), so no backfill. Downgrade drops
the table (dev/CI smoke only — user preferences are lost).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_notification_settings",
        sa.Column("user_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("assigned", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("watched", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("commented", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("user_notification_settings")
