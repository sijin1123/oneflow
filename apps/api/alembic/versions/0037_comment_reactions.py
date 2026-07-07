"""comment_reactions (emoji reactions on comments)

Revision ID: 0037
Revises: 0036
Create Date: 2026-07-07

Reactions store STABLE KEYS (thumbs_up, heart, …) — the API path and the CHECK
share one ASCII vocabulary, so Unicode normalization/variation-selector drift
is unrepresentable (PLAN v17.1 R1-③); the web maps keys to glyphs for display.
user_id CASCADEs: a reaction is an ephemeral social signal, not an audit
record — it dies with the user (R1-⑤, unlike comment authorship/mentions).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None

_KEYS = "('thumbs_up', 'thumbs_down', 'tada', 'heart', 'smile', 'confused')"


def upgrade() -> None:
    op.create_table(
        "comment_reactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("comment_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("emoji", sa.String(16), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["comment_id"], ["work_package_comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        # Short name — the naming convention adds the ck_comment_reactions_ prefix.
        sa.CheckConstraint(f"emoji IN {_KEYS}", name="emoji_allowed"),
        sa.UniqueConstraint(
            "comment_id", "user_id", "emoji", name="uq_reactions_comment_user_emoji"
        ),
    )
    op.create_index("ix_comment_reactions_comment", "comment_reactions", ["comment_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops every reaction.
    op.drop_index("ix_comment_reactions_comment", table_name="comment_reactions")
    op.drop_table("comment_reactions")
