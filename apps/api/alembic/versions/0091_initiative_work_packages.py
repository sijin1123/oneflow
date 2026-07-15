"""initiative work package scope

Revision ID: 0091
Revises: 0090
Create Date: 2026-07-15
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0091"
down_revision = "0090"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "initiative_work_packages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("initiative_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_package_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["initiative_id", "project_id"],
            ["initiative_projects.initiative_id", "initiative_projects.project_id"],
            name=op.f("fk_initiative_work_packages_connected_project"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["work_package_id", "project_id"],
            ["work_packages.id", "work_packages.project_id"],
            name=op.f("fk_initiative_work_packages_same_project"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_initiative_work_packages")),
        sa.UniqueConstraint(
            "initiative_id",
            "work_package_id",
            name=op.f("uq_initiative_work_packages_pair"),
        ),
    )
    op.create_index(
        op.f("ix_initiative_work_packages_project"),
        "initiative_work_packages",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_initiative_work_packages_work_package"),
        "initiative_work_packages",
        ["work_package_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_initiative_work_packages_work_package"),
        table_name="initiative_work_packages",
    )
    op.drop_index(
        op.f("ix_initiative_work_packages_project"),
        table_name="initiative_work_packages",
    )
    op.drop_table("initiative_work_packages")
