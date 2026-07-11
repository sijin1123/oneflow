"""ai workspace policy

Revision ID: 0073
Revises: 0072
Create Date: 2026-07-11
"""

import sqlalchemy as sa

from alembic import op

revision = "0073"
down_revision = "0072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("feature_key_allowed", "workspace_feature_policies", type_="check")
    op.create_check_constraint(
        "feature_key_allowed",
        "workspace_feature_policies",
        "feature_key IN ('wiki','ai')",
    )
    op.execute(
        "INSERT INTO workspace_feature_policies (feature_key, enabled, revision) "
        "VALUES ('ai', false, 1)"
    )
    op.alter_column("workspace_feature_policies", "enabled", server_default=sa.false())


def downgrade() -> None:
    op.alter_column("workspace_feature_policies", "enabled", server_default=sa.true())
    op.execute("DELETE FROM workspace_feature_policies WHERE feature_key = 'ai'")
    op.drop_constraint("feature_key_allowed", "workspace_feature_policies", type_="check")
    op.create_check_constraint(
        "feature_key_allowed",
        "workspace_feature_policies",
        "feature_key IN ('wiki')",
    )
