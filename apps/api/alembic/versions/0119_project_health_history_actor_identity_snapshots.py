"""project health history actor identity snapshots

Revision ID: 0119
Revises: 0118
Create Date: 2026-07-22
"""

import sqlalchemy as sa

from alembic import op

revision = "0119"
down_revision = "0118"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_health_history",
        sa.Column("changed_by_name_snapshot", sa.String(120), nullable=True),
    )
    op.add_column(
        "project_health_history",
        sa.Column("changed_by_profile_image_storage_key", sa.String(80), nullable=True),
    )
    op.add_column(
        "project_health_history",
        sa.Column("changed_by_profile_image_content_type", sa.String(32), nullable=True),
    )
    op.create_check_constraint(
        "changed_by_image_metadata_complete",
        "project_health_history",
        "(changed_by_profile_image_storage_key IS NULL "
        "AND changed_by_profile_image_content_type IS NULL) OR "
        "(changed_by_profile_image_storage_key IS NOT NULL "
        "AND changed_by_profile_image_content_type IS NOT NULL)",
    )
    op.create_index(
        "ix_project_health_history_changed_by_image_key",
        "project_health_history",
        ["changed_by_profile_image_storage_key"],
    )
    op.execute(
        "UPDATE project_health_history AS history "
        "SET changed_by_name_snapshot = users.display_name "
        "FROM users WHERE history.changed_by = users.id"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_health_history_changed_by_image_key",
        table_name="project_health_history",
    )
    op.drop_constraint(
        "changed_by_image_metadata_complete",
        "project_health_history",
        type_="check",
    )
    op.drop_column("project_health_history", "changed_by_profile_image_content_type")
    op.drop_column("project_health_history", "changed_by_profile_image_storage_key")
    op.drop_column("project_health_history", "changed_by_name_snapshot")
