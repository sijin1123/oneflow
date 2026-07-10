"""saved_filters: is_locked (author's own edit guard)

Revision ID: 0052
Revises: 0051
Create Date: 2026-07-08

Additive. Locking is a MISTAKE guard, not a security boundary (v54.1 R1-③ —
older code ignoring the flag is an accepted rolling-deploy window); a locked
view only accepts the single-field unlock PATCH.
"""

import sqlalchemy as sa

from alembic import op

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "saved_filters",
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("saved_filters", "is_locked")
