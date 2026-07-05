"""korean ICU collation

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-05

Creates a deterministic ICU collation for Korean dictionary ordering. Deterministic
so it still permits LIKE/pattern matching — it is used only in explicit ORDER BY
(not as a column default), so the existing subject ILIKE filter is untouched.
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE COLLATION IF NOT EXISTS oneflow_korean "
        "(provider = icu, locale = 'ko-KR', deterministic = true)"
    )


def downgrade() -> None:
    op.execute("DROP COLLATION IF EXISTS oneflow_korean")
