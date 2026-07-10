"""webhook pinned transport signing-key snapshots

Revision ID: 0064
Revises: 0063
Create Date: 2026-07-10
"""

import sqlalchemy as sa

from alembic import op

revision = "0064"
down_revision = "0063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "webhook_endpoints",
        sa.Column(
            "signing_key_id",
            sa.String(length=64),
            server_default="legacy-v1",
            nullable=True,
        ),
    )
    op.execute(
        "UPDATE webhook_endpoints SET signing_key_id = 'legacy-v1' WHERE signing_key_id IS NULL"
    )
    op.alter_column("webhook_endpoints", "signing_key_id", nullable=False)
    op.add_column(
        "webhook_deliveries", sa.Column("signing_key_id", sa.String(length=64), nullable=True)
    )
    op.add_column("webhook_deliveries", sa.Column("secret_version", sa.Integer(), nullable=True))
    op.add_column(
        "webhook_deliveries",
        sa.Column(
            "signing_snapshot_source",
            sa.String(length=24),
            server_default="captured",
            nullable=True,
        ),
    )
    op.execute("""
        UPDATE webhook_deliveries AS d
           SET signing_key_id = e.signing_key_id,
               secret_version = e.secret_version,
               signing_snapshot_source = 'migrated_current'
          FROM webhook_endpoints AS e
         WHERE e.id = d.endpoint_id
    """)
    # During an expand/rolling window, a 0063 writer does not know the snapshot
    # columns. Capture the endpoint values in PostgreSQL before NOT NULL checks.
    op.execute("""
        CREATE FUNCTION set_webhook_delivery_signing_snapshot()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.signing_key_id IS NULL OR NEW.secret_version IS NULL THEN
                SELECT signing_key_id, secret_version
                  INTO NEW.signing_key_id, NEW.secret_version
                  FROM webhook_endpoints
                 WHERE id = NEW.endpoint_id;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_webhook_delivery_signing_snapshot
        BEFORE INSERT ON webhook_deliveries
        FOR EACH ROW EXECUTE FUNCTION set_webhook_delivery_signing_snapshot()
    """)
    op.alter_column("webhook_deliveries", "signing_key_id", nullable=False)
    op.alter_column("webhook_deliveries", "secret_version", nullable=False)
    op.alter_column("webhook_deliveries", "signing_snapshot_source", nullable=False)
    op.create_check_constraint(
        "signing_snapshot_source",
        "webhook_deliveries",
        "signing_snapshot_source IN ('captured','migrated_current')",
    )
    op.create_index(
        "ix_webhook_deliveries_signing_snapshot",
        "webhook_deliveries",
        ["signing_key_id", "secret_version"],
    )
    op.create_table(
        "webhook_secret_rotations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("endpoint_id", sa.UUID(), nullable=False),
        sa.Column("previous_signing_key_id", sa.String(length=64), nullable=False),
        sa.Column("signing_key_id", sa.String(length=64), nullable=False),
        sa.Column("previous_secret_version", sa.Integer(), nullable=False),
        sa.Column("secret_version", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=240), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["endpoint_id"], ["webhook_endpoints.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_webhook_secret_rotations_endpoint_created",
        "webhook_secret_rotations",
        ["endpoint_id", "created_at"],
    )


def downgrade() -> None:
    # Dropping key identity would make legacy code sign non-legacy records with
    # the wrong master key. Require an explicit data/key rollback first.
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM webhook_endpoints WHERE signing_key_id <> 'legacy-v1'
            ) OR EXISTS (
                SELECT 1 FROM webhook_deliveries WHERE signing_key_id <> 'legacy-v1'
            ) THEN
                RAISE EXCEPTION
                    'cannot downgrade 0064 while non-legacy webhook signing snapshots exist';
            END IF;
        END $$
    """)
    op.drop_index(
        "ix_webhook_secret_rotations_endpoint_created",
        table_name="webhook_secret_rotations",
    )
    op.drop_table("webhook_secret_rotations")
    op.drop_index("ix_webhook_deliveries_signing_snapshot", table_name="webhook_deliveries")
    # A development-only intermediate 0064 existed before provenance was
    # added; keep local/test rollback compatible with both shapes.
    op.execute(
        "ALTER TABLE webhook_deliveries "
        "DROP CONSTRAINT IF EXISTS ck_webhook_deliveries_signing_snapshot_source"
    )
    op.execute("DROP TRIGGER IF EXISTS trg_webhook_delivery_signing_snapshot ON webhook_deliveries")
    op.execute("DROP FUNCTION IF EXISTS set_webhook_delivery_signing_snapshot()")
    op.execute("ALTER TABLE webhook_deliveries DROP COLUMN IF EXISTS signing_snapshot_source")
    op.drop_column("webhook_deliveries", "secret_version")
    op.drop_column("webhook_deliveries", "signing_key_id")
    op.drop_column("webhook_endpoints", "signing_key_id")
