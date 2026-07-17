"""single-workspace invitation lifecycle

Revision ID: 0103
Revises: 0102
Create Date: 2026-07-17
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0103"
down_revision = "0102"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("accepted_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("char_length(email) BETWEEN 3 AND 255", name="email_length"),
        sa.CheckConstraint(
            "char_length(display_name) BETWEEN 1 AND 120", name="display_name_length"
        ),
        sa.CheckConstraint("char_length(token_hash) = 64", name="token_hash_length"),
        sa.CheckConstraint("version >= 0", name="version_nonnegative"),
        sa.CheckConstraint(
            "NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)",
            name="single_terminal_state",
        ),
        sa.CheckConstraint(
            "(accepted_at IS NULL) = (accepted_user_id IS NULL)",
            name="accepted_user_matches_timestamp",
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["accepted_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        "ix_workspace_invitations_email_created",
        "workspace_invitations",
        ["email", "created_at"],
    )
    op.create_index(
        "ix_workspace_invitations_created",
        "workspace_invitations",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_invitations_created", table_name="workspace_invitations")
    op.drop_index("ix_workspace_invitations_email_created", table_name="workspace_invitations")
    op.drop_table("workspace_invitations")
