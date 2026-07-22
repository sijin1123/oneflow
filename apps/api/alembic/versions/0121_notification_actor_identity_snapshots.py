"""notification actor identity snapshots

Revision ID: 0121
Revises: 0120
Create Date: 2026-07-22
"""

import sqlalchemy as sa

from alembic import op

revision = "0121"
down_revision = "0120"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notifications",
        sa.Column("actor_name_snapshot", sa.String(120), nullable=True),
    )
    op.add_column(
        "notifications",
        sa.Column("actor_profile_image_storage_key", sa.String(80), nullable=True),
    )
    op.add_column(
        "notifications",
        sa.Column("actor_profile_image_content_type", sa.String(32), nullable=True),
    )
    op.create_check_constraint(
        "notification_actor_image_metadata_complete",
        "notifications",
        "(actor_profile_image_storage_key IS NULL "
        "AND actor_profile_image_content_type IS NULL) OR "
        "(actor_profile_image_storage_key IS NOT NULL "
        "AND actor_profile_image_content_type IS NOT NULL)",
    )
    op.create_index(
        "ix_notifications_actor_profile_image_key",
        "notifications",
        ["actor_profile_image_storage_key"],
    )
    op.execute(
        "UPDATE notifications AS notification "
        "SET actor_name_snapshot = users.display_name "
        "FROM users WHERE notification.actor_id = users.id"
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_actor_profile_image_key", table_name="notifications")
    op.drop_constraint(
        "notification_actor_image_metadata_complete",
        "notifications",
        type_="check",
    )
    op.drop_column("notifications", "actor_profile_image_content_type")
    op.drop_column("notifications", "actor_profile_image_storage_key")
    op.drop_column("notifications", "actor_name_snapshot")
