"""intake decision actor identity snapshots

Revision ID: 0120
Revises: 0119
Create Date: 2026-07-22
"""

import sqlalchemy as sa

from alembic import op

revision = "0120"
down_revision = "0119"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "intake_decision_history",
        sa.Column("decided_by_name_snapshot", sa.String(120), nullable=True),
    )
    op.add_column(
        "intake_decision_history",
        sa.Column("decided_by_profile_image_storage_key", sa.String(80), nullable=True),
    )
    op.add_column(
        "intake_decision_history",
        sa.Column("decided_by_profile_image_content_type", sa.String(32), nullable=True),
    )
    op.create_check_constraint(
        "decided_by_image_metadata_complete",
        "intake_decision_history",
        "(decided_by_profile_image_storage_key IS NULL "
        "AND decided_by_profile_image_content_type IS NULL) OR "
        "(decided_by_profile_image_storage_key IS NOT NULL "
        "AND decided_by_profile_image_content_type IS NOT NULL)",
    )
    op.create_index(
        "ix_intake_decision_history_decided_by_image_key",
        "intake_decision_history",
        ["decided_by_profile_image_storage_key"],
    )
    op.execute(
        "UPDATE intake_decision_history AS history "
        "SET decided_by_name_snapshot = users.display_name "
        "FROM users WHERE history.decided_by = users.id"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_intake_decision_history_decided_by_image_key",
        table_name="intake_decision_history",
    )
    op.drop_constraint(
        "decided_by_image_metadata_complete",
        "intake_decision_history",
        type_="check",
    )
    op.drop_column("intake_decision_history", "decided_by_profile_image_content_type")
    op.drop_column("intake_decision_history", "decided_by_profile_image_storage_key")
    op.drop_column("intake_decision_history", "decided_by_name_snapshot")
