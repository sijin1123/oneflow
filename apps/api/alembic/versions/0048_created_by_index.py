"""work_packages: created_by index (created-by-me home query)

Revision ID: 0048
Revises: 0047
Create Date: 2026-07-08

The 0033 created_by column shipped without an index; /me/work now filters on
it (v45.1 R1-①).
"""

from alembic import op

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_work_packages_created_by", "work_packages", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_work_packages_created_by", table_name="work_packages")
