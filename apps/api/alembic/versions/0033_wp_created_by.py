"""work_packages.created_by (author column)

Revision ID: 0033
Revises: 0032
Create Date: 2026-07-07

Additive nullable author column. Existing rows stay NULL — there is no reliable
history to backfill from (documented in the coverage ledger); every creation
path (direct create, CSV/Jira import, intake accept, action-item convert,
duplicate) records the actor from this migration on.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("work_packages", sa.Column("created_by", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_work_packages_created_by_users",
        "work_packages",
        "users",
        ["created_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops authorship data.
    op.drop_constraint("fk_work_packages_created_by_users", "work_packages", type_="foreignkey")
    op.drop_column("work_packages", "created_by")
