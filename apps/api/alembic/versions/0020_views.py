"""saved_filters → named views (layout/sort/is_shared)

Revision ID: 0020
Revises: 0019
Create Date: 2026-07-06

Additive columns with server defaults — every existing row is automatically a
valid private list-layout view (no data migration, no API break). Downgrade
drops the columns (dev/CI smoke only; sharing/layout choices are lost).
"""

import sqlalchemy as sa

from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "saved_filters",
        sa.Column("layout", sa.String(20), nullable=False, server_default="list"),
    )
    op.add_column("saved_filters", sa.Column("sort", sa.String(20), nullable=True))
    op.add_column(
        "saved_filters",
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Short name — the naming convention adds the ck_saved_filters_ prefix (0014).
    op.create_check_constraint(
        "layout_allowed",
        "saved_filters",
        "layout IN ('list', 'board', 'tree', 'timeline', 'calendar')",
    )


def downgrade() -> None:
    # Raw SQL: op.drop_constraint would re-apply the ck_ naming convention on an
    # already-prefixed name (the 0014 double-prefix trap, but on DROP).
    op.execute("ALTER TABLE saved_filters DROP CONSTRAINT ck_saved_filters_layout_allowed")
    op.drop_column("saved_filters", "is_shared")
    op.drop_column("saved_filters", "sort")
    op.drop_column("saved_filters", "layout")
