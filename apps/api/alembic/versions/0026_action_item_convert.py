"""meeting_action_items.converted_wp_id

Revision ID: 0026
Revises: 0025
Create Date: 2026-07-07

Additive nullable FK — forward-only in production; downgrade drops the column
(dev/CI smoke only; conversion links are lost, the created WPs stay).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meeting_action_items", sa.Column("converted_wp_id", UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_meeting_action_items_converted_wp_id_work_packages",
        "meeting_action_items",
        "work_packages",
        ["converted_wp_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_meeting_action_items_converted_wp_id_work_packages",
        "meeting_action_items",
        type_="foreignkey",
    )
    op.drop_column("meeting_action_items", "converted_wp_id")
