"""milestones + work_packages.milestone_id

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-05
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "milestones",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_milestones_project", "milestones", ["project_id", "due_date"])

    op.add_column("work_packages", sa.Column("milestone_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_work_packages_milestone_id_milestones",
        "work_packages",
        "milestones",
        ["milestone_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_work_packages_milestone", "work_packages", ["milestone_id"])


def downgrade() -> None:
    op.drop_index("ix_work_packages_milestone", table_name="work_packages")
    op.drop_constraint(
        "fk_work_packages_milestone_id_milestones", "work_packages", type_="foreignkey"
    )
    op.drop_column("work_packages", "milestone_id")
    op.drop_table("milestones")
