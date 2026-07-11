"""customers workspace domain

Revision ID: 0076
Revises: 0075
Create Date: 2026-07-11
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0076"
down_revision = "0075"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("url", sa.String(length=2048), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_customers_name"),
    )
    op.create_index("ix_customers_archived_name", "customers", ["archived_at", "name"])
    op.add_column(
        "work_packages", sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_work_packages_customer_id",
        "work_packages",
        "customers",
        ["customer_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_work_packages_customer", "work_packages", ["customer_id"])
    op.drop_constraint("feature_key_allowed", "workspace_feature_policies", type_="check")
    op.create_check_constraint(
        "feature_key_allowed",
        "workspace_feature_policies",
        "feature_key IN ('wiki','ai','initiatives','releases','customers')",
    )
    op.execute(
        "INSERT INTO workspace_feature_policies (feature_key, enabled, revision) "
        "VALUES ('customers', false, 1)"
    )


def downgrade() -> None:
    op.execute("DELETE FROM workspace_feature_policies WHERE feature_key = 'customers'")
    op.drop_constraint("feature_key_allowed", "workspace_feature_policies", type_="check")
    op.create_check_constraint(
        "feature_key_allowed",
        "workspace_feature_policies",
        "feature_key IN ('wiki','ai','initiatives','releases')",
    )
    op.drop_index("ix_work_packages_customer", table_name="work_packages")
    op.drop_constraint("fk_work_packages_customer_id", "work_packages", type_="foreignkey")
    op.drop_column("work_packages", "customer_id")
    op.drop_index("ix_customers_archived_name", table_name="customers")
    op.drop_table("customers")
