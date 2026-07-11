"""releases workspace policy

Revision ID: 0075
Revises: 0074
Create Date: 2026-07-11
"""

from alembic import op

revision = "0075"
down_revision = "0074"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("feature_key_allowed", "workspace_feature_policies", type_="check")
    op.create_check_constraint(
        "feature_key_allowed",
        "workspace_feature_policies",
        "feature_key IN ('wiki','ai','initiatives','releases')",
    )
    op.execute(
        "INSERT INTO workspace_feature_policies (feature_key, enabled, revision) "
        "VALUES ('releases', true, 1)"
    )


def downgrade() -> None:
    op.execute("DELETE FROM workspace_feature_policies WHERE feature_key = 'releases'")
    op.drop_constraint("feature_key_allowed", "workspace_feature_policies", type_="check")
    op.create_check_constraint(
        "feature_key_allowed",
        "workspace_feature_policies",
        "feature_key IN ('wiki','ai','initiatives')",
    )
