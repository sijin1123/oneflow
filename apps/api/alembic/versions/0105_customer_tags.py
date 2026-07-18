"""customer tags

Revision ID: 0105
Revises: 0104
Create Date: 2026-07-18
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0105"
down_revision = "0104"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "customer_tags_array",
        "customers",
        "jsonb_typeof(tags) = 'array' AND jsonb_array_length(tags) <= 12",
    )
    op.create_index("ix_customers_tags", "customers", ["tags"], postgresql_using="gin")


def downgrade() -> None:
    op.drop_index("ix_customers_tags", table_name="customers", postgresql_using="gin")
    op.drop_constraint("customer_tags_array", "customers", type_="check")
    op.drop_column("customers", "tags")
