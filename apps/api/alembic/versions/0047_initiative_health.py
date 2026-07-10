"""initiatives: health report (mirrors 0043 project health)

Revision ID: 0047
Revises: 0046
Create Date: 2026-07-08

Additive; the Pass-37 (v37.1) contract verbatim: closed vocabulary, shape
CHECK (unset = fully unset; set carries its timestamp; updated_by is exempt —
user-delete SET NULL). `health` is a qualitative axis SEPARATE from the
lifecycle `state`.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("initiatives", sa.Column("health", sa.String(20), nullable=True))
    op.add_column("initiatives", sa.Column("health_note", sa.Text(), nullable=True))
    op.add_column("initiatives", sa.Column("health_updated_by", UUID(as_uuid=True), nullable=True))
    op.add_column(
        "initiatives", sa.Column("health_updated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_initiatives_health_updated_by",
        "initiatives",
        "users",
        ["health_updated_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "health_allowed",
        "initiatives",
        "health IN ('on_track', 'at_risk', 'off_track')",
    )
    op.create_check_constraint(
        "health_shape",
        "initiatives",
        "(health IS NULL AND health_note IS NULL"
        " AND health_updated_by IS NULL AND health_updated_at IS NULL)"
        " OR (health IS NOT NULL AND health_updated_at IS NOT NULL)",
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops every health report.
    op.execute("ALTER TABLE initiatives DROP CONSTRAINT IF EXISTS ck_initiatives_health_shape")
    op.execute("ALTER TABLE initiatives DROP CONSTRAINT IF EXISTS ck_initiatives_health_allowed")
    op.drop_constraint("fk_initiatives_health_updated_by", "initiatives", type_="foreignkey")
    op.drop_column("initiatives", "health_updated_at")
    op.drop_column("initiatives", "health_updated_by")
    op.drop_column("initiatives", "health_note")
    op.drop_column("initiatives", "health")
