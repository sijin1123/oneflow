"""durable cycle scope history

Revision ID: 0094
Revises: 0093
Create Date: 2026-07-16

Additive. Existing cycle assignments become a baseline at one explicit
tracking epoch; no pre-migration assignment timestamp is fabricated.
Downgrade drops scope analytics history and is for development/CI only.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0094"
down_revision = "0093"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cycles",
        sa.Column("scope_tracking_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "cycles",
        sa.Column("scope_tracking_complete", sa.Boolean(), nullable=True),
    )
    # One statement gives every pre-existing cycle the same honest coverage
    # boundary. New cycles default to complete tracking from creation onward.
    op.execute(
        sa.text(
            "WITH epoch AS (SELECT clock_timestamp() AS at) "
            "UPDATE cycles SET scope_tracking_started_at = epoch.at, "
            "scope_tracking_complete = false FROM epoch"
        )
    )
    op.alter_column(
        "cycles",
        "scope_tracking_started_at",
        nullable=False,
        server_default=sa.text("clock_timestamp()"),
    )
    op.alter_column(
        "cycles",
        "scope_tracking_complete",
        nullable=False,
        server_default=sa.text("true"),
    )

    op.create_table(
        "cycle_scope_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cycle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_package_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=16), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "event_type IN ('baseline', 'added', 'removed')",
            name=op.f("ck_cycle_scope_events_event_type_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_cycle_scope_events_actor_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["cycle_id", "project_id"],
            ["cycles.id", "cycles.project_id"],
            name="fk_cycle_scope_events_cycle_project",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["work_package_id"],
            ["work_packages.id"],
            name=op.f("fk_cycle_scope_events_work_package_id_work_packages"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cycle_scope_events")),
    )
    op.create_index(
        "ix_cycle_scope_events_cycle_occurred",
        "cycle_scope_events",
        ["cycle_id", "occurred_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_cycle_scope_events_wp_occurred",
        "cycle_scope_events",
        ["work_package_id", "occurred_at", "id"],
        unique=False,
    )
    op.execute(
        sa.text(
            "INSERT INTO cycle_scope_events "
            "(id, project_id, cycle_id, work_package_id, event_type, actor_id, occurred_at) "
            "SELECT gen_random_uuid(), wp.project_id, wp.cycle_id, wp.id, "
            "'baseline', NULL, c.scope_tracking_started_at "
            "FROM work_packages wp "
            "JOIN cycles c ON c.id = wp.cycle_id AND c.project_id = wp.project_id "
            "WHERE wp.cycle_id IS NOT NULL"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_cycle_scope_events_wp_occurred", table_name="cycle_scope_events")
    op.drop_index("ix_cycle_scope_events_cycle_occurred", table_name="cycle_scope_events")
    op.drop_table("cycle_scope_events")
    op.drop_column("cycles", "scope_tracking_complete")
    op.drop_column("cycles", "scope_tracking_started_at")
