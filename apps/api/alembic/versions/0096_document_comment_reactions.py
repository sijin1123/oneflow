"""document comment free-emoji reactions

Revision ID: 0096
Revises: 0095
Create Date: 2026-07-16

Document reactions are ephemeral collaboration signals. They cascade with the
comment and user, use an open emoji set, and keep the full grapheme grammar in
the only application write path.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0096"
down_revision = "0095"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_comment_reactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("comment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(emoji) BETWEEN 1 AND 16"
            " AND emoji ~ '[^\\x01-\\x7F]'"
            " AND emoji !~ '[[:space:][:cntrl:]]'",
            name="emoji_shape",
        ),
        sa.ForeignKeyConstraint(
            ["comment_id"],
            ["project_document_comments.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "comment_id",
            "user_id",
            "emoji",
            name="uq_document_comment_reactions_comment_user_emoji",
        ),
    )
    op.create_index(
        "ix_document_comment_reactions_comment",
        "document_comment_reactions",
        ["comment_id"],
        unique=False,
    )


def downgrade() -> None:
    # DEV/CI ONLY: drops every Document reaction.
    op.drop_index(
        "ix_document_comment_reactions_comment",
        table_name="document_comment_reactions",
    )
    op.drop_table("document_comment_reactions")
