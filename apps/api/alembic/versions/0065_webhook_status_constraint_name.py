"""normalize webhook delivery status constraint name

Revision ID: 0065
Revises: 0064
Create Date: 2026-07-10
"""

from alembic import op

revision = "0065"
down_revision = "0064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = 'webhook_deliveries'::regclass
               AND conname = 'ck_webhook_deliveries_ck_webhook_deliveries_status'
          ) AND NOT EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = 'webhook_deliveries'::regclass
               AND conname = 'ck_webhook_deliveries_status'
          ) THEN
            ALTER TABLE webhook_deliveries
              RENAME CONSTRAINT ck_webhook_deliveries_ck_webhook_deliveries_status
              TO ck_webhook_deliveries_status;
          ELSIF EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = 'webhook_deliveries'::regclass
               AND conname = 'ck_webhook_deliveries_ck_webhook_deliveries_status'
          ) THEN
            ALTER TABLE webhook_deliveries
              DROP CONSTRAINT ck_webhook_deliveries_ck_webhook_deliveries_status;
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = 'webhook_deliveries'::regclass
               AND conname = 'ck_webhook_deliveries_status'
          ) AND NOT EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = 'webhook_deliveries'::regclass
               AND conname = 'ck_webhook_deliveries_ck_webhook_deliveries_status'
          ) THEN
            ALTER TABLE webhook_deliveries
              RENAME CONSTRAINT ck_webhook_deliveries_status
              TO ck_webhook_deliveries_ck_webhook_deliveries_status;
          END IF;
        END $$;
        """
    )
