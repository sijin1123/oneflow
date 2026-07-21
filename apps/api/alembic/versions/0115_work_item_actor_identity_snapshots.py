"""work item actor identity snapshots

Revision ID: 0115
Revises: 0114
Create Date: 2026-07-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0115"
down_revision = "0114"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "work_package_comments", sa.Column("author_name_snapshot", sa.String(120), nullable=True)
    )
    op.add_column(
        "work_package_comments",
        sa.Column("author_profile_image_storage_key", sa.String(80), nullable=True),
    )
    op.add_column(
        "work_package_comments",
        sa.Column("author_profile_image_content_type", sa.String(32), nullable=True),
    )
    op.add_column("activities", sa.Column("actor_name_snapshot", sa.String(120), nullable=True))
    op.add_column(
        "activities", sa.Column("actor_profile_image_storage_key", sa.String(80), nullable=True)
    )
    op.add_column(
        "activities", sa.Column("actor_profile_image_content_type", sa.String(32), nullable=True)
    )
    op.create_check_constraint(
        "author_image_metadata_complete",
        "work_package_comments",
        "(author_profile_image_storage_key IS NULL "
        "AND author_profile_image_content_type IS NULL) OR "
        "(author_profile_image_storage_key IS NOT NULL "
        "AND author_profile_image_content_type IS NOT NULL)",
    )
    op.create_check_constraint(
        "activity_actor_profile_image_metadata_complete",
        "activities",
        "(actor_profile_image_storage_key IS NULL "
        "AND actor_profile_image_content_type IS NULL) OR "
        "(actor_profile_image_storage_key IS NOT NULL "
        "AND actor_profile_image_content_type IS NOT NULL)",
    )
    op.create_index(
        "ix_comments_author_profile_image_key",
        "work_package_comments",
        ["author_profile_image_storage_key"],
    )
    op.create_index(
        "ix_activities_actor_profile_image_key",
        "activities",
        ["actor_profile_image_storage_key"],
    )
    op.execute(
        "UPDATE work_package_comments AS c "
        "SET author_name_snapshot = u.display_name "
        "FROM users AS u WHERE c.author_id = u.id"
    )
    op.execute(
        "UPDATE activities AS a SET actor_name_snapshot = u.display_name "
        "FROM users AS u WHERE a.actor_id = u.id"
    )


def downgrade() -> None:
    op.drop_index("ix_activities_actor_profile_image_key", table_name="activities")
    op.drop_index("ix_comments_author_profile_image_key", table_name="work_package_comments")
    op.drop_constraint(
        "activity_actor_profile_image_metadata_complete", "activities", type_="check"
    )
    op.drop_constraint(
        "author_image_metadata_complete",
        "work_package_comments",
        type_="check",
    )
    op.drop_column("activities", "actor_profile_image_content_type")
    op.drop_column("activities", "actor_profile_image_storage_key")
    op.drop_column("activities", "actor_name_snapshot")
    op.drop_column("work_package_comments", "author_profile_image_content_type")
    op.drop_column("work_package_comments", "author_profile_image_storage_key")
    op.drop_column("work_package_comments", "author_name_snapshot")
