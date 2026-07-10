"""project_document_comments (flat plain-text comments on wiki pages)

Revision ID: 0046
Revises: 0045
Create Date: 2026-07-08

Deliberately LIGHT (Pass 43 slice 1): flat (no threading), plain text (the
document body is the rich surface), no mentions/reactions. author_id survives
user deletion via SET NULL (the WP-comment contract); rows die with their
document or project (CASCADE).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_document_comments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "author_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    # Composite same-project FK (v43.1 R1-⓪): REUSES uq_project_documents_id_project
    # (0029 — never create new uniques); a cross-project comment is unrepresentable
    # and comments die with their document (CASCADE cascades from projects too).
    op.execute(
        "ALTER TABLE project_document_comments "
        "ADD CONSTRAINT fk_document_comments_doc_same_project "
        "FOREIGN KEY (document_id, project_id) "
        "REFERENCES project_documents (id, project_id) ON DELETE CASCADE"
    )
    op.create_index(
        "ix_document_comments_doc_created",
        "project_document_comments",
        ["document_id", "created_at"],
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops every document comment.
    op.drop_index("ix_document_comments_doc_created", table_name="project_document_comments")
    op.drop_table("project_document_comments")
