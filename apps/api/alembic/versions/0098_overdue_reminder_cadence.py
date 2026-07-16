"""personal overdue reminder cadence

Revision ID: 0098
Revises: 0097
Create Date: 2026-07-16
"""

import sqlalchemy as sa

from alembic import op

revision = "0098"
down_revision = "0097"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_notification_settings",
        sa.Column(
            "overdue_reminder_days",
            sa.SmallInteger(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.create_check_constraint(
        "overdue_reminder_days_allowed",
        "user_notification_settings",
        "overdue_reminder_days IN (0, 3, 7, 14)",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_user_notification_settings_overdue_reminder_days_allowed"),
        "user_notification_settings",
        type_="check",
    )
    op.drop_column("user_notification_settings", "overdue_reminder_days")
