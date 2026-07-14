"""OIDC identity bindings and one-time login attempts

Revision ID: 0084
Revises: 0083
Create Date: 2026-07-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0084"
down_revision = "0083"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oidc_identities",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("issuer", sa.String(length=512), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_oidc_identities_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_oidc_identities"),
        sa.UniqueConstraint("issuer", "subject", name="uq_oidc_identities_issuer_subject"),
        sa.UniqueConstraint("issuer", "user_id", name="uq_oidc_identities_issuer_user"),
    )
    op.create_index("ix_oidc_identities_user", "oidc_identities", ["user_id"])

    op.create_table(
        "oidc_login_attempts",
        sa.Column("state_hash", sa.String(length=64), nullable=False),
        sa.Column("browser_token_hash", sa.String(length=64), nullable=False),
        sa.Column("nonce_hash", sa.String(length=64), nullable=False),
        sa.Column("code_verifier", sa.String(length=128), nullable=False),
        sa.Column("next_path", sa.String(length=2048), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("state_hash", name="pk_oidc_login_attempts"),
    )
    op.create_index("ix_oidc_login_attempts_expires", "oidc_login_attempts", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_oidc_login_attempts_expires", table_name="oidc_login_attempts")
    op.drop_table("oidc_login_attempts")
    op.drop_index("ix_oidc_identities_user", table_name="oidc_identities")
    op.drop_table("oidc_identities")
