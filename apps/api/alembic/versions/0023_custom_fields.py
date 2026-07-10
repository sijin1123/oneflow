"""custom_fields + wp_custom_values

Revision ID: 0023
Revises: 0022
Create Date: 2026-07-06

Additive (two new tables) — forward-only in production. The values table FK is
RESTRICT so a field with values cannot be deleted even by raw SQL. Downgrade
drops both tables (dev/CI smoke only; all custom data is lost).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "custom_fields",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("field_type", sa.String(20), nullable=False),
        sa.Column("options", JSONB(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        # Short name — the naming convention adds the ck_custom_fields_ prefix.
        sa.CheckConstraint(
            "field_type IN ('text', 'number', 'boolean', 'date', 'dropdown', 'member', 'url')",
            name="field_type_allowed",
        ),
        sa.UniqueConstraint("project_id", "name", name="uq_custom_fields_project_name"),
    )
    op.create_index("ix_custom_fields_project", "custom_fields", ["project_id", "position"])

    op.create_table(
        "wp_custom_values",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("work_package_id", UUID(as_uuid=True), nullable=False),
        sa.Column("field_id", UUID(as_uuid=True), nullable=False),
        sa.Column("value", JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["work_package_id"], ["work_packages.id"], ondelete="CASCADE"),
        # RESTRICT (not CASCADE): deleting a field with live values must fail at
        # the DB level — kills the count-then-delete TOCTOU and raw-SQL loss.
        sa.ForeignKeyConstraint(["field_id"], ["custom_fields.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("work_package_id", "field_id", name="uq_wp_custom_values_wp_field"),
    )
    op.create_index("ix_wp_custom_values_field", "wp_custom_values", ["field_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops every custom field definition and value.
    op.drop_index("ix_wp_custom_values_field", table_name="wp_custom_values")
    op.drop_table("wp_custom_values")
    op.drop_index("ix_custom_fields_project", table_name="custom_fields")
    op.drop_table("custom_fields")
