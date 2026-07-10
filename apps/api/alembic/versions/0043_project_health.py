"""projects: health status (on track / at risk / off track)

Revision ID: 0043
Revises: 0042
Create Date: 2026-07-08

Additive. `health` is a CLOSED vocabulary (labels are web-owned — the
status/type-key principle); null = unset. The note and the audit stamp
(updated_by SET NULL / updated_at) travel with it.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("health", sa.String(20), nullable=True))
    op.add_column("projects", sa.Column("health_note", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("health_updated_by", UUID(as_uuid=True), nullable=True))
    op.add_column(
        "projects", sa.Column("health_updated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_projects_health_updated_by",
        "projects",
        "users",
        ["health_updated_by"],
        ["id"],
        ondelete="SET NULL",
    )
    # Short names — the convention adds the ck_projects_ prefix.
    op.create_check_constraint(
        "health_allowed",
        "projects",
        "health IN ('on_track', 'at_risk', 'off_track')",
    )
    # Shape invariant (v37.1 R1-①): unset means FULLY unset; a set health
    # always carries its timestamp. updated_by is exempt (user-delete SET NULL).
    op.create_check_constraint(
        "health_shape",
        "projects",
        "(health IS NULL AND health_note IS NULL"
        " AND health_updated_by IS NULL AND health_updated_at IS NULL)"
        " OR (health IS NOT NULL AND health_updated_at IS NOT NULL)",
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops every health report.
    op.execute("ALTER TABLE projects DROP CONSTRAINT IF EXISTS ck_projects_health_shape")
    op.execute("ALTER TABLE projects DROP CONSTRAINT ck_projects_health_allowed")
    op.drop_constraint("fk_projects_health_updated_by", "projects", type_="foreignkey")
    op.drop_column("projects", "health_updated_at")
    op.drop_column("projects", "health_updated_by")
    op.drop_column("projects", "health_note")
    op.drop_column("projects", "health")
