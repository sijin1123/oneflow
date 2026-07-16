"""document comment inline anchors

Revision ID: 0095
Revises: 0094
Create Date: 2026-07-16

Additive and legacy-compatible. Existing page-level comments keep null anchor
metadata; new inline threads use a stable UUID embedded in sanitized document
HTML plus a bounded quote snapshot.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0095"
down_revision = "0094"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_document_comments",
        sa.Column("anchor_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "project_document_comments",
        sa.Column("anchor_quote", sa.String(length=500), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_project_document_comments_anchor_shape"),
        "project_document_comments",
        "(anchor_id IS NULL AND anchor_quote IS NULL) OR "
        "(anchor_id IS NOT NULL AND anchor_quote IS NOT NULL "
        "AND char_length(anchor_quote) BETWEEN 1 AND 500)",
    )
    op.create_index(
        "ix_document_comments_doc_anchor_created",
        "project_document_comments",
        ["document_id", "anchor_id", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    # DEV/CI ONLY: drops inline anchor metadata while preserving comment bodies.
    op.drop_index(
        "ix_document_comments_doc_anchor_created",
        table_name="project_document_comments",
    )
    op.drop_constraint(
        op.f("ck_project_document_comments_anchor_shape"),
        "project_document_comments",
        type_="check",
    )
    op.drop_column("project_document_comments", "anchor_quote")
    op.drop_column("project_document_comments", "anchor_id")
