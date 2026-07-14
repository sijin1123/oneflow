"""project phases

Revision ID: 0083
Revises: 0082
Create Date: 2026-07-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0083"
down_revision = "0082"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_phases",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(length=20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.CheckConstraint("key IN ('discover', 'plan', 'deliver', 'close')", name="key_allowed"),
        sa.CheckConstraint(
            "start_date IS NULL OR end_date IS NULL OR start_date <= end_date",
            name="dates_ordered",
        ),
        sa.CheckConstraint("version >= 0", name="version_nonnegative"),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_project_phases_project_id_projects",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_project_phases"),
        sa.UniqueConstraint("project_id", "key", name="uq_project_phases_project_key"),
    )
    op.create_index("ix_project_phases_project_key", "project_phases", ["project_id", "key"])


def downgrade() -> None:
    op.drop_index("ix_project_phases_project_key", table_name="project_phases")
    op.drop_table("project_phases")
