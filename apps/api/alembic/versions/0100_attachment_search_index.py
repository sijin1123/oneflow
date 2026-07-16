"""attachment search index

Revision ID: 0100
Revises: 0099
Create Date: 2026-07-17
"""

import sqlalchemy as sa

from alembic import op

revision = "0100"
down_revision = "0099"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("search_text", sa.Text(), nullable=True))
    op.add_column(
        "attachments",
        sa.Column("search_index_status", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "attachments",
        sa.Column("search_indexed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        "UPDATE attachments SET search_index_status = "
        "CASE WHEN storage_key IS NULL THEN 'not_applicable' ELSE 'pending' END"
    )
    op.alter_column("attachments", "search_index_status", nullable=False)
    op.alter_column(
        "attachments",
        "search_index_status",
        server_default=sa.text("'not_applicable'"),
    )
    op.create_check_constraint(
        op.f("ck_attachments_search_index_status_allowed"),
        "attachments",
        "search_index_status IN "
        "('not_applicable','pending','indexed','unsupported','too_large',"
        "'invalid_text','missing_blob')",
    )
    op.create_check_constraint(
        op.f("ck_attachments_search_text_shape"),
        "attachments",
        "COALESCE(char_length(search_text), 0) <= 524288 AND ("
        "(search_index_status = 'indexed' AND search_text IS NOT NULL "
        "AND search_indexed_at IS NOT NULL) OR "
        "(search_index_status IN ('unsupported','too_large','invalid_text','missing_blob') "
        "AND search_text IS NULL AND search_indexed_at IS NOT NULL) OR "
        "(search_index_status IN ('pending','not_applicable') "
        "AND search_text IS NULL AND search_indexed_at IS NULL))",
    )
    op.create_index(
        op.f("ix_attachments_project_search_status_created"),
        "attachments",
        ["project_id", "search_index_status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_attachments_project_search_status_created"),
        table_name="attachments",
    )
    op.drop_constraint(
        op.f("ck_attachments_search_text_shape"),
        "attachments",
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_attachments_search_index_status_allowed"),
        "attachments",
        type_="check",
    )
    op.drop_column("attachments", "search_indexed_at")
    op.drop_column("attachments", "search_index_status")
    op.drop_column("attachments", "search_text")
