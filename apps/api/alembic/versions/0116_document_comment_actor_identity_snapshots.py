"""document comment actor identity snapshots

Revision ID: 0116
Revises: 0115
Create Date: 2026-07-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0116"
down_revision = "0115"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_document_comments",
        sa.Column("author_name_snapshot", sa.String(120), nullable=True),
    )
    op.add_column(
        "project_document_comments",
        sa.Column("author_profile_image_storage_key", sa.String(80), nullable=True),
    )
    op.add_column(
        "project_document_comments",
        sa.Column("author_profile_image_content_type", sa.String(32), nullable=True),
    )
    op.create_check_constraint(
        "author_image_metadata_complete",
        "project_document_comments",
        "(author_profile_image_storage_key IS NULL "
        "AND author_profile_image_content_type IS NULL) OR "
        "(author_profile_image_storage_key IS NOT NULL "
        "AND author_profile_image_content_type IS NOT NULL)",
    )
    op.create_index(
        "ix_document_comments_author_profile_image_key",
        "project_document_comments",
        ["author_profile_image_storage_key"],
    )
    op.execute(
        "UPDATE project_document_comments AS c "
        "SET author_name_snapshot = u.display_name "
        "FROM users AS u WHERE c.author_id = u.id"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_comments_author_profile_image_key",
        table_name="project_document_comments",
    )
    op.drop_constraint(
        "author_image_metadata_complete",
        "project_document_comments",
        type_="check",
    )
    op.drop_column("project_document_comments", "author_profile_image_content_type")
    op.drop_column("project_document_comments", "author_profile_image_storage_key")
    op.drop_column("project_document_comments", "author_name_snapshot")
