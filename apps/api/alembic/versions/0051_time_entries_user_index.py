"""time_entries: (user_id, spent_on) index for the personal time view

Revision ID: 0051
Revises: 0050
Create Date: 2026-07-08

/me/time-entries filters WHERE user_id = me AND spent_on BETWEEN — the
existing index only covers (work_package_id, spent_on).
"""

from alembic import op

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_time_entries_user_spent", "time_entries", ["user_id", "spent_on"])


def downgrade() -> None:
    op.drop_index("ix_time_entries_user_spent", table_name="time_entries")
