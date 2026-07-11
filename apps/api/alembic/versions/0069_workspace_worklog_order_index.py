"""workspace worklog ordering index

Revision ID: 0069
Revises: 0068
Create Date: 2026-07-11
"""

from alembic import op

revision = "0069"
down_revision = "0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_time_entries_spent_created_id",
        "time_entries",
        ["spent_on", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_time_entries_spent_created_id", table_name="time_entries")
