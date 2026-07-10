"""project_types + backfill for existing projects

Revision ID: 0027
Revises: 0026
Create Date: 2026-07-07

Additive table + an idempotent backfill (ON CONFLICT DO NOTHING — safe to
re-run). Rolling-deploy note: projects created by OLD code inside the deploy
window have no rows; the new validation treats "no rows" as "all types
enabled", so nothing 422s until configuration actually exists.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None

_DEFAULTS = (
    ("task", "작업", 0),
    ("bug", "버그", 1),
    ("feature", "기능", 2),
    ("milestone", "마일스톤", 3),
)


def upgrade() -> None:
    op.create_table(
        "project_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(20), nullable=False),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        # Short name — the naming convention adds the ck_project_types_ prefix.
        sa.CheckConstraint("key IN ('task', 'bug', 'feature', 'milestone')", name="key_allowed"),
        sa.UniqueConstraint("project_id", "key", name="uq_project_types_project_key"),
    )
    op.create_index("ix_project_types_project", "project_types", ["project_id", "position"])

    for key, name, pos in _DEFAULTS:
        op.execute(
            sa.text(
                "INSERT INTO project_types (id, project_id, key, name, position, is_active) "
                "SELECT gen_random_uuid(), p.id, :key, :name, :pos, true FROM projects p "
                "ON CONFLICT ON CONSTRAINT uq_project_types_project_key DO NOTHING"
            ).bindparams(key=key, name=name, pos=pos)
        )


def downgrade() -> None:
    op.drop_index("ix_project_types_project", table_name="project_types")
    op.drop_table("project_types")
