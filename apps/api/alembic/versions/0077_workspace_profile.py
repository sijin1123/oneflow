"""singleton workspace profile

Revision ID: 0077
Revises: 0076
Create Date: 2026-07-11
"""

import sqlalchemy as sa

from alembic import op

revision = "0077"
down_revision = "0076"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_profiles",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("revision", sa.BigInteger(), server_default="1", nullable=False),
        sa.Column("updated_by_user_id", sa.UUID(), nullable=True),
        sa.Column("updated_by_name", sa.String(length=120), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="workspace_profile_singleton"),
        sa.CheckConstraint(
            "length(btrim(name)) BETWEEN 1 AND 80",
            name="workspace_profile_name_not_blank",
        ),
        sa.CheckConstraint("revision >= 1", name="workspace_profile_revision_positive"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("INSERT INTO workspace_profiles (id, name, revision) VALUES (1, 'OneFlow', 1)")


def downgrade() -> None:
    op.drop_table("workspace_profiles")
