"""users: workspace admin flag

Revision ID: 0041
Revises: 0040
Create Date: 2026-07-08

Additive. Workspace admin gates the user directory (/api/v1/users). The dev
auto-provisioned user becomes admin at provision time (dev mode only —
startup guard §9); a production bootstrap (env-designated first admin) is
explicitly deferred to the real-OIDC pass, where login itself first exists.
"""

import sqlalchemy as sa

from alembic import op

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    # Existing dev DBs already hold the auto-provisioned dev user — promote it
    # here so a migrated DB is never adminless (v33.1 R1-②). Idempotent; the
    # fixed dev email never exists outside development/test.
    op.execute("UPDATE users SET is_admin = true WHERE email = 'dev@oneflow.local'")


def downgrade() -> None:
    # DEV/CI ONLY — drops every admin grant.
    op.drop_column("users", "is_admin")
