"""custom_fields.applies_to (per-type field binding)

Revision ID: 0028
Revises: 0027
Create Date: 2026-07-07

Additive nullable column with a DB CHECK enforcing "null OR a jsonb array that
is a subset of the fixed type keys" — API-bypassing writes cannot smuggle
unknown keys. null = the field applies to every type.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

_CHECK = (
    "applies_to IS NULL OR ("
    "jsonb_typeof(applies_to) = 'array' "
    'AND applies_to <@ \'["task", "bug", "feature", "milestone"]\'::jsonb)'
)


def upgrade() -> None:
    op.add_column("custom_fields", sa.Column("applies_to", JSONB(), nullable=True))
    # Short name — the naming convention adds the ck_custom_fields_ prefix.
    op.create_check_constraint("applies_to_valid", "custom_fields", _CHECK)


def downgrade() -> None:
    # Raw SQL drop: op.drop_constraint would re-apply the ck_ naming convention
    # on an already-prefixed name (the 0014/0020 double-prefix trap).
    op.execute("ALTER TABLE custom_fields DROP CONSTRAINT ck_custom_fields_applies_to_valid")
    op.drop_column("custom_fields", "applies_to")
