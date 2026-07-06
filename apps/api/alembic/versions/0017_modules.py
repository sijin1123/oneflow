"""modules + work_packages.module_id (composite same-project FK)

Revision ID: 0017
Revises: 0016
Create Date: 2026-07-06

Additive only — same forward-only production posture as 0016: on a bad deploy
revert the code and leave the schema. The downgrade exists for the dev/CI
migrate smoke and DROPS all module data and every work_packages.module_id
value — never run it against a database whose module data matters.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "modules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("lead_id", UUID(as_uuid=True), nullable=True),
        sa.Column("state", sa.String(20), nullable=False, server_default="planned"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_id"], ["users.id"], ondelete="SET NULL"),
        # Short names only — the naming convention adds the ck_modules_ prefix.
        sa.CheckConstraint(
            "state IN ('planned', 'in_progress', 'paused', 'completed', 'cancelled')",
            name="state_allowed",
        ),
        sa.CheckConstraint(
            "start_date IS NULL OR target_date IS NULL OR start_date <= target_date",
            name="date_order",
        ),
        sa.UniqueConstraint("id", "project_id", name="uq_modules_id_project"),
    )
    op.create_index("ix_modules_project", "modules", ["project_id", "state"])

    op.add_column("work_packages", sa.Column("module_id", UUID(as_uuid=True), nullable=True))
    op.execute(
        "ALTER TABLE work_packages "
        "ADD CONSTRAINT fk_work_packages_module_project "
        "FOREIGN KEY (module_id, project_id) REFERENCES modules (id, project_id) "
        "ON DELETE SET NULL (module_id)"
    )
    op.create_index("ix_work_packages_module", "work_packages", ["module_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops modules and every work_packages.module_id assignment.
    op.drop_index("ix_work_packages_module", table_name="work_packages")
    op.drop_constraint("fk_work_packages_module_project", "work_packages", type_="foreignkey")
    op.drop_column("work_packages", "module_id")
    op.drop_index("ix_modules_project", table_name="modules")
    op.drop_table("modules")
