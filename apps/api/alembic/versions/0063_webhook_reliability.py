"""durable webhook outbox leases and event identity

Revision ID: 0063
Revises: 0062
Create Date: 2026-07-10
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0063"
down_revision = "0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "webhook_endpoints",
        sa.Column("manual_window_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "webhook_endpoints",
        sa.Column("manual_attempt_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "webhook_deliveries",
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    uuid_pattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    identity_source = f"""
        SELECT id, endpoint_id,
               CASE
                 WHEN COALESCE(payload->>'id', '') ~* '{uuid_pattern}'
                 THEN (payload->>'id')::uuid
                 ELSE id
               END AS canonical_event_id,
               created_at,
               attempt_count
          FROM webhook_deliveries
    """
    op.execute(
        f"""
        WITH source AS ({identity_source}),
        aggregated AS (
            SELECT endpoint_id, canonical_event_id,
                   (array_agg(id ORDER BY created_at DESC, id DESC))[1] AS keep_id,
                   SUM(attempt_count)::integer AS total_attempts
              FROM source
             GROUP BY endpoint_id, canonical_event_id
        )
        UPDATE webhook_deliveries AS delivery
           SET event_id = aggregated.canonical_event_id,
               attempt_count = GREATEST(delivery.attempt_count, aggregated.total_attempts)
          FROM aggregated
         WHERE delivery.id = aggregated.keep_id
        """
    )
    op.execute(
        f"""
        WITH source AS ({identity_source}),
        keepers AS (
            SELECT endpoint_id, canonical_event_id,
                   (array_agg(id ORDER BY created_at DESC, id DESC))[1] AS keep_id
              FROM source
             GROUP BY endpoint_id, canonical_event_id
        )
        DELETE FROM webhook_deliveries AS delivery
         USING source, keepers
         WHERE delivery.id = source.id
           AND source.endpoint_id = keepers.endpoint_id
           AND source.canonical_event_id = keepers.canonical_event_id
           AND delivery.id <> keepers.keep_id
        """
    )
    op.alter_column("webhook_deliveries", "event_id", nullable=False)
    op.add_column(
        "webhook_deliveries",
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "webhook_deliveries", sa.Column("lease_owner", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "webhook_deliveries",
        sa.Column("lease_token", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "webhook_deliveries",
        sa.Column("leased_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "webhook_deliveries",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        UPDATE webhook_deliveries
           SET status = 'failed',
               error = COALESCE(error, 'manual test interrupted before migration'),
               completed_at = COALESCE(attempted_at, created_at),
               next_attempt_at = NULL,
               lease_owner = NULL,
               lease_token = NULL,
               leased_until = NULL
         WHERE event_type = 'oneflow.test' AND status IN ('pending', 'sending')
        """
    )
    op.execute(
        """
        UPDATE webhook_deliveries
           SET status = 'pending',
               error = COALESCE(error, 'delivery recovered during migration'),
               next_attempt_at = now(),
               lease_owner = NULL,
               lease_token = NULL,
               leased_until = NULL
         WHERE event_type <> 'oneflow.test' AND status = 'sending'
        """
    )
    op.execute(
        """
        UPDATE webhook_deliveries
           SET next_attempt_at = COALESCE(next_attempt_at, now())
         WHERE event_type <> 'oneflow.test' AND status = 'pending'
        """
    )
    op.execute(
        """
        UPDATE webhook_deliveries
           SET completed_at = COALESCE(completed_at, attempted_at, created_at)
         WHERE status IN ('succeeded', 'failed', 'skipped')
        """
    )
    op.create_unique_constraint(
        "uq_webhook_delivery_endpoint_event",
        "webhook_deliveries",
        ["endpoint_id", "event_id"],
    )
    op.create_index(
        "ix_webhook_deliveries_due",
        "webhook_deliveries",
        ["status", "next_attempt_at", "leased_until"],
    )
    op.create_check_constraint(
        op.f("ck_webhook_deliveries_status"),
        "webhook_deliveries",
        "status IN ('pending','sending','retrying','succeeded','failed','dead_letter','skipped')",
    )


def downgrade() -> None:
    # A development-only intermediate 0063 briefly existed without this check;
    # keep rollback compatible with those local databases as well as fresh installs.
    op.execute(
        "ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS ck_webhook_deliveries_status"
    )
    op.execute(
        "ALTER TABLE webhook_deliveries "
        "DROP CONSTRAINT IF EXISTS ck_webhook_deliveries_ck_webhook_deliveries_status"
    )
    op.execute(
        """
        UPDATE webhook_deliveries
           SET status = 'failed',
               error = COALESCE(error, 'delivery requires manual retry after rollback')
         WHERE status IN ('pending', 'sending', 'retrying', 'dead_letter')
        """
    )
    op.execute("DROP INDEX IF EXISTS ix_webhook_deliveries_due")
    op.execute(
        "ALTER TABLE webhook_deliveries "
        "DROP CONSTRAINT IF EXISTS uq_webhook_delivery_endpoint_event"
    )
    for column in (
        "completed_at",
        "leased_until",
        "lease_token",
        "lease_owner",
        "next_attempt_at",
        "event_id",
    ):
        op.execute(f'ALTER TABLE webhook_deliveries DROP COLUMN IF EXISTS "{column}"')
    for column in ("manual_attempt_count", "manual_window_started_at"):
        op.execute(f'ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS "{column}"')
