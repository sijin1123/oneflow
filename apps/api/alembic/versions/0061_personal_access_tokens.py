"""personal access tokens

Revision ID: 0061
Revises: 0060
Create Date: 2026-07-10

User-owned developer tokens for the UI-first developer security surface. Raw
tokens are never stored; only a SHA-256 hash and a display prefix are kept.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "personal_access_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        "ix_personal_access_tokens_user",
        "personal_access_tokens",
        ["user_id"],
    )
    op.create_index(
        "ix_personal_access_tokens_expires",
        "personal_access_tokens",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_personal_access_tokens_expires", table_name="personal_access_tokens")
    op.drop_index("ix_personal_access_tokens_user", table_name="personal_access_tokens")
    op.drop_table("personal_access_tokens")
