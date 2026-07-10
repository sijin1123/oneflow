"""notifications: intake triage kinds + per-user toggle

Revision ID: 0050
Revises: 0049
Create Date: 2026-07-08

Additive; the 0044 pattern verbatim. intake_accepted carries the converted
work package (deep link); intake_declined (declined + duplicate verdicts) has
no WP — the web routes to the project's intake page. Snoozed is an interim
state and never notifies.
"""

import sqlalchemy as sa

from alembic import op

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None

_CONSTRAINT = "ck_notifications_notification_kind_allowed"
_OLD = (
    "('assigned', 'watch_status', 'watch_comment', 'watch_assigned', 'mention',"
    " 'due_soon', 'overdue')"
)
_NEW = (
    "('assigned', 'watch_status', 'watch_comment', 'watch_assigned', 'mention',"
    " 'due_soon', 'overdue', 'intake_accepted', 'intake_declined')"
)


def upgrade() -> None:
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_CONSTRAINT}")
    op.execute(f"ALTER TABLE notifications ADD CONSTRAINT {_CONSTRAINT} CHECK (kind IN {_NEW})")
    op.add_column(
        "user_notification_settings",
        sa.Column("intake", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    # Stable anchor for WP-less intake notifications (v49.1 R1-①): the web
    # highlights the item on the intake page; SET NULL degrades to the page.
    op.add_column("notifications", sa.Column("intake_item_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_notifications_intake_item",
        "notifications",
        "intake_items",
        ["intake_item_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops delivered intake notifications.
    op.drop_constraint("fk_notifications_intake_item", "notifications", type_="foreignkey")
    op.drop_column("notifications", "intake_item_id")
    op.drop_column("user_notification_settings", "intake")
    op.execute(f"DELETE FROM notifications WHERE kind NOT IN {_OLD}")
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_CONSTRAINT}")
    op.execute(f"ALTER TABLE notifications ADD CONSTRAINT {_CONSTRAINT} CHECK (kind IN {_OLD})")
