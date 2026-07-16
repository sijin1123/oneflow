"""initiative subscriptions and notifications

Revision ID: 0092
Revises: 0091
Create Date: 2026-07-15
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0092"
down_revision = "0091"
branch_labels = None
depends_on = None

_KIND_CONSTRAINT = "ck_notifications_notification_kind_allowed"
_TARGET_CONSTRAINT = "ck_notifications_notification_target_shape"
_OLD_KINDS = (
    "('assigned', 'watch_status', 'watch_comment', 'watch_assigned', 'mention',"
    " 'due_soon', 'overdue', 'intake_accepted', 'intake_declined')"
)
_NEW_KINDS = (
    "('assigned', 'watch_status', 'watch_comment', 'watch_assigned', 'mention',"
    " 'due_soon', 'overdue', 'intake_accepted', 'intake_declined',"
    " 'initiative_updated', 'initiative_state', 'initiative_health',"
    " 'initiative_owner', 'initiative_scope')"
)


def upgrade() -> None:
    op.create_table(
        "initiative_subscribers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("initiative_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["initiative_id"], ["initiatives.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_initiative_subscribers")),
        sa.UniqueConstraint(
            "initiative_id",
            "user_id",
            name=op.f("uq_initiative_subscribers_pair"),
        ),
    )
    op.create_index(
        op.f("ix_initiative_subscribers_user"),
        "initiative_subscribers",
        ["user_id"],
        unique=False,
    )
    op.add_column(
        "user_notification_settings",
        sa.Column("initiatives", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "notifications",
        sa.Column("initiative_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_notifications_initiative_id_initiatives",
        "notifications",
        "initiatives",
        ["initiative_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column("notifications", "project_id", existing_type=postgresql.UUID(), nullable=True)
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_KIND_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_KIND_CONSTRAINT} CHECK (kind IN {_NEW_KINDS})"
    )
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_TARGET_CONSTRAINT} CHECK ("
        "(kind LIKE 'initiative_%' AND initiative_id IS NOT NULL AND project_id IS NULL "
        "AND work_package_id IS NULL AND intake_item_id IS NULL) OR "
        "(kind NOT LIKE 'initiative_%' AND initiative_id IS NULL AND project_id IS NOT NULL))"
    )


def downgrade() -> None:
    # DEV/CI ONLY: old schema cannot represent delivered initiative notifications.
    op.execute("DELETE FROM notifications WHERE kind LIKE 'initiative_%'")
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_TARGET_CONSTRAINT}")
    op.execute(f"ALTER TABLE notifications DROP CONSTRAINT {_KIND_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT {_KIND_CONSTRAINT} CHECK (kind IN {_OLD_KINDS})"
    )
    op.alter_column("notifications", "project_id", existing_type=postgresql.UUID(), nullable=False)
    op.drop_constraint(
        "fk_notifications_initiative_id_initiatives", "notifications", type_="foreignkey"
    )
    op.drop_column("notifications", "initiative_id")
    op.drop_column("user_notification_settings", "initiatives")
    op.drop_index(op.f("ix_initiative_subscribers_user"), table_name="initiative_subscribers")
    op.drop_table("initiative_subscribers")
