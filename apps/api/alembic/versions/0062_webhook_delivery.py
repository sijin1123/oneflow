"""workspace webhook endpoints and delivery audit

Revision ID: 0062
Revises: 0061
Create Date: 2026-07-10
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "webhook_endpoints",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("event_types", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("secret_version", sa.Integer(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_webhook_endpoints_active", "webhook_endpoints", ["is_active", "deleted_at"])
    op.create_index("ix_webhook_endpoints_created", "webhook_endpoints", ["created_at"])

    op.create_table(
        "webhook_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("endpoint_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("response_status", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["endpoint_id"], ["webhook_endpoints.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_webhook_deliveries_endpoint_created",
        "webhook_deliveries",
        ["endpoint_id", "created_at"],
    )
    op.create_index("ix_webhook_deliveries_status", "webhook_deliveries", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_webhook_deliveries_status", table_name="webhook_deliveries")
    op.drop_index("ix_webhook_deliveries_endpoint_created", table_name="webhook_deliveries")
    op.drop_table("webhook_deliveries")
    op.drop_index("ix_webhook_endpoints_created", table_name="webhook_endpoints")
    op.drop_index("ix_webhook_endpoints_active", table_name="webhook_endpoints")
    op.drop_table("webhook_endpoints")
