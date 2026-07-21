"""initiative activity actor identity snapshots

Revision ID: 0117
Revises: 0116
Create Date: 2026-07-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0117"
down_revision = "0116"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "initiative_activities",
        sa.Column("actor_name_snapshot", sa.String(120), nullable=True),
    )
    op.add_column(
        "initiative_activities",
        sa.Column("actor_profile_image_storage_key", sa.String(80), nullable=True),
    )
    op.add_column(
        "initiative_activities",
        sa.Column("actor_profile_image_content_type", sa.String(32), nullable=True),
    )
    op.create_check_constraint(
        "actor_image_metadata_complete",
        "initiative_activities",
        "(actor_profile_image_storage_key IS NULL "
        "AND actor_profile_image_content_type IS NULL) OR "
        "(actor_profile_image_storage_key IS NOT NULL "
        "AND actor_profile_image_content_type IS NOT NULL)",
    )
    op.create_index(
        "ix_initiative_activities_actor_image_key",
        "initiative_activities",
        ["actor_profile_image_storage_key"],
    )
    op.execute(
        "UPDATE initiative_activities AS a "
        "SET actor_name_snapshot = u.display_name "
        "FROM users AS u WHERE a.actor_id = u.id"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_initiative_activities_actor_image_key",
        table_name="initiative_activities",
    )
    op.drop_constraint(
        "actor_image_metadata_complete",
        "initiative_activities",
        type_="check",
    )
    op.drop_column("initiative_activities", "actor_profile_image_content_type")
    op.drop_column("initiative_activities", "actor_profile_image_storage_key")
    op.drop_column("initiative_activities", "actor_name_snapshot")
