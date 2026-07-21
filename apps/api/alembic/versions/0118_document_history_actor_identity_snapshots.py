"""document history actor identity snapshots

Revision ID: 0118
Revises: 0117
Create Date: 2026-07-22
"""

import sqlalchemy as sa

from alembic import op

revision = "0118"
down_revision = "0117"
branch_labels = None
depends_on = None


def _add_actor_snapshot(table_name: str, index_name: str) -> None:
    op.add_column(
        table_name,
        sa.Column("actor_name_snapshot", sa.String(120), nullable=True),
    )
    op.add_column(
        table_name,
        sa.Column("actor_profile_image_storage_key", sa.String(80), nullable=True),
    )
    op.add_column(
        table_name,
        sa.Column("actor_profile_image_content_type", sa.String(32), nullable=True),
    )
    op.create_check_constraint(
        "actor_image_metadata_complete",
        table_name,
        "(actor_profile_image_storage_key IS NULL "
        "AND actor_profile_image_content_type IS NULL) OR "
        "(actor_profile_image_storage_key IS NOT NULL "
        "AND actor_profile_image_content_type IS NOT NULL)",
    )
    op.create_index(index_name, table_name, ["actor_profile_image_storage_key"])
    op.execute(
        f"UPDATE {table_name} AS history "
        "SET actor_name_snapshot = users.display_name "
        "FROM users WHERE history.actor_id = users.id"
    )


def _drop_actor_snapshot(table_name: str, index_name: str) -> None:
    op.drop_index(index_name, table_name=table_name)
    op.drop_constraint("actor_image_metadata_complete", table_name, type_="check")
    op.drop_column(table_name, "actor_profile_image_content_type")
    op.drop_column(table_name, "actor_profile_image_storage_key")
    op.drop_column(table_name, "actor_name_snapshot")


def upgrade() -> None:
    _add_actor_snapshot(
        "document_activities",
        "ix_document_activities_actor_image_key",
    )
    _add_actor_snapshot(
        "document_revisions",
        "ix_document_revisions_actor_image_key",
    )


def downgrade() -> None:
    _drop_actor_snapshot(
        "document_revisions",
        "ix_document_revisions_actor_image_key",
    )
    _drop_actor_snapshot(
        "document_activities",
        "ix_document_activities_actor_image_key",
    )
