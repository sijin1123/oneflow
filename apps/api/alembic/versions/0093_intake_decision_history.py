"""append-only intake decision history

Revision ID: 0093
Revises: 0092
Create Date: 2026-07-16

Additive. Each successful triage transition is retained independently from
the intake item's current decision fields. Downgrade drops audit history and
is for development/CI rollback only.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0093"
down_revision = "0092"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intake_decision_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("intake_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("previous_status", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("snooze_until", sa.Date(), nullable=True),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "previous_status IN ('pending', 'snoozed')",
            name=op.f("ck_intake_decision_history_previous_status_allowed"),
        ),
        sa.CheckConstraint(
            "status IN ('accepted', 'declined', 'snoozed', 'duplicate')",
            name=op.f("ck_intake_decision_history_status_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["decided_by"],
            ["users.id"],
            name=op.f("fk_intake_decision_history_decided_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["intake_item_id"],
            ["intake_items.id"],
            name=op.f("fk_intake_decision_history_intake_item_id_intake_items"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_intake_decision_history")),
    )
    op.create_index(
        "ix_intake_decision_history_item_created",
        "intake_decision_history",
        ["intake_item_id", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_intake_decision_history_item_created",
        table_name="intake_decision_history",
    )
    op.drop_table("intake_decision_history")
