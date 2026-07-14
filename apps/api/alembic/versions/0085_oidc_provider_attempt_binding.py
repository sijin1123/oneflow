"""Bind OIDC login attempts to a provider configuration.

Revision ID: 0085
Revises: 0084
Create Date: 2026-07-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0085"
down_revision = "0084"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("oidc_login_attempts", sa.Column("provider", sa.String(length=32), nullable=True))
    op.add_column(
        "oidc_login_attempts", sa.Column("config_fingerprint", sa.String(length=64), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("oidc_login_attempts", "config_fingerprint")
    op.drop_column("oidc_login_attempts", "provider")
