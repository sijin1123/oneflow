"""project_statuses (configurable workflow labels/order)

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

# Kept self-contained (not imported from app models) so the migration stays stable
# if the default labels ever change in code.
DEFAULTS = (
    ("backlog", "백로그", 0),
    ("todo", "할 일", 1),
    ("in_progress", "진행 중", 2),
    ("in_review", "검토 중", 3),
    ("done", "완료", 4),
    ("cancelled", "취소", 5),
)


def upgrade() -> None:
    op.create_table(
        "project_statuses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(20), nullable=False),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", "key", name="uq_project_status_key"),
    )
    op.create_index("ix_project_statuses_project", "project_statuses", ["project_id", "position"])
    # Backfill the default workflow for every existing project (PG13+ gen_random_uuid).
    for key, name, pos in DEFAULTS:
        op.execute(
            sa.text(
                "INSERT INTO project_statuses (id, project_id, key, name, position) "
                "SELECT gen_random_uuid(), id, :k, :n, :p FROM projects"
            ).bindparams(k=key, n=name, p=pos)
        )


def downgrade() -> None:
    op.drop_index("ix_project_statuses_project", table_name="project_statuses")
    op.drop_table("project_statuses")
