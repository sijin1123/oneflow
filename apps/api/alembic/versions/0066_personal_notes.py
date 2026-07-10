"""personal notes

Revision ID: 0066
Revises: 0065
Create Date: 2026-07-10
"""

import sqlalchemy as sa

from alembic import op

revision = "0066"
down_revision = "0065"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "personal_notes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("body", sa.Text(), server_default="", nullable=False),
        sa.Column("is_pinned", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("version", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("char_length(title) BETWEEN 1 AND 120", name="title_length"),
        sa.CheckConstraint("char_length(body) <= 4000", name="body_length"),
        sa.CheckConstraint("position >= 0", name="position_nonnegative"),
        sa.CheckConstraint("version >= 0", name="version_nonnegative"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_personal_notes_user_pinned_position",
        "personal_notes",
        ["user_id", "is_pinned", "position"],
    )


def downgrade() -> None:
    op.drop_index("ix_personal_notes_user_pinned_position", table_name="personal_notes")
    op.drop_table("personal_notes")
