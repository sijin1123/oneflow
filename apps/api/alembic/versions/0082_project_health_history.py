"""project health history

Revision ID: 0082
Revises: 0081
Create Date: 2026-07-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0082"
down_revision = "0081"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_health_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("previous_health", sa.String(length=20), nullable=True),
        sa.Column("previous_note", sa.Text(), nullable=True),
        sa.Column("health", sa.String(length=20), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("changed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "previous_health IS NULL OR previous_health IN ('on_track', 'at_risk', 'off_track')",
            name="previous_health_valid",
        ),
        sa.CheckConstraint(
            "health IS NULL OR health IN ('on_track', 'at_risk', 'off_track')",
            name="health_valid",
        ),
        sa.CheckConstraint(
            "previous_health IS NOT NULL OR previous_note IS NULL",
            name="previous_note_requires_health",
        ),
        sa.CheckConstraint(
            "health IS NOT NULL OR note IS NULL",
            name="note_requires_health",
        ),
        sa.CheckConstraint(
            "previous_health IS DISTINCT FROM health OR previous_note IS DISTINCT FROM note",
            name="report_changed",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_project_health_history_project_id_projects",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["changed_by"],
            ["users.id"],
            name="fk_project_health_history_changed_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_project_health_history"),
    )
    op.create_index(
        "ix_project_health_history_project_created",
        "project_health_history",
        ["project_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_health_history_project_created",
        table_name="project_health_history",
    )
    op.drop_table("project_health_history")
