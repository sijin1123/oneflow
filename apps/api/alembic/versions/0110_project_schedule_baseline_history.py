"""project schedule baseline history

Revision ID: 0110
Revises: 0109
Create Date: 2026-07-19
"""

import sqlalchemy as sa

from alembic import op

revision = "0110"
down_revision = "0109"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_project_schedule_baselines_project_id",
        "project_schedule_baselines",
        type_="unique",
    )
    op.add_column(
        "project_schedule_baselines",
        sa.Column("name", sa.String(length=80), nullable=True),
    )
    op.execute("UPDATE project_schedule_baselines SET name = '기준선 1'")
    op.alter_column("project_schedule_baselines", "name", nullable=False)
    op.create_unique_constraint(
        "uq_project_schedule_baselines_project_name",
        "project_schedule_baselines",
        ["project_id", "name"],
    )
    op.create_index(
        "ix_project_schedule_baselines_project_captured",
        "project_schedule_baselines",
        ["project_id", "captured_at"],
    )


def downgrade() -> None:
    # Keep the newest snapshot for each project before restoring the legacy
    # one-row contract so a rollback remains deterministic.
    op.execute(
        """
        DELETE FROM project_schedule_baselines AS baseline
        USING project_schedule_baselines AS newer
        WHERE baseline.project_id = newer.project_id
          AND (baseline.captured_at, baseline.id) < (newer.captured_at, newer.id)
        """
    )
    op.drop_index(
        "ix_project_schedule_baselines_project_captured",
        table_name="project_schedule_baselines",
    )
    op.drop_constraint(
        "uq_project_schedule_baselines_project_name",
        "project_schedule_baselines",
        type_="unique",
    )
    op.drop_column("project_schedule_baselines", "name")
    op.create_unique_constraint(
        "uq_project_schedule_baselines_project_id",
        "project_schedule_baselines",
        ["project_id"],
    )
