"""workspace feature policies

Revision ID: 0070
Revises: 0069
Create Date: 2026-07-11
"""

import sqlalchemy as sa

from alembic import op

revision = "0070"
down_revision = "0069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_feature_policies",
        sa.Column("feature_key", sa.String(length=40), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("revision", sa.BigInteger(), server_default="1", nullable=False),
        sa.Column("updated_by_user_id", sa.UUID(), nullable=True),
        sa.Column("updated_by_name", sa.String(length=120), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("feature_key IN ('wiki')", name="feature_key_allowed"),
        sa.CheckConstraint("revision >= 1", name="revision_positive"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("feature_key"),
    )
    op.execute(
        "INSERT INTO workspace_feature_policies (feature_key, enabled, revision) "
        "VALUES ('wiki', true, 1)"
    )


def downgrade() -> None:
    op.drop_table("workspace_feature_policies")
