"""initiatives workspace policy

Revision ID: 0074
Revises: 0073
Create Date: 2026-07-11
"""

from alembic import op

revision = "0074"
down_revision = "0073"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("feature_key_allowed", "workspace_feature_policies", type_="check")
    op.create_check_constraint(
        "feature_key_allowed",
        "workspace_feature_policies",
        "feature_key IN ('wiki','ai','initiatives')",
    )
    op.execute(
        "INSERT INTO workspace_feature_policies (feature_key, enabled, revision) "
        "VALUES ('initiatives', true, 1)"
    )


def downgrade() -> None:
    op.execute("DELETE FROM workspace_feature_policies WHERE feature_key = 'initiatives'")
    op.drop_constraint("feature_key_allowed", "workspace_feature_policies", type_="check")
    op.create_check_constraint(
        "feature_key_allowed",
        "workspace_feature_policies",
        "feature_key IN ('wiki','ai')",
    )
