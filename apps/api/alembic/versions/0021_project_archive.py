"""projects.archived_at

Revision ID: 0021
Revises: 0020
Create Date: 2026-07-06

Additive nullable column. Forward-only in production: reverting the CODE simply
ignores the column (archive is then temporarily inert — restore anytime via
UPDATE projects SET archived_at = NULL). Downgrade is for the dev/CI smoke.
"""

import sqlalchemy as sa

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "archived_at")
