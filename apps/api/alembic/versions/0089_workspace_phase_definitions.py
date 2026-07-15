"""workspace project phase definitions

Revision ID: 0089
Revises: 0088
Create Date: 2026-07-15
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0089"
down_revision = "0088"
branch_labels = None
depends_on = None

_DEFAULT_DEFINITIONS = sa.text(
    "'["
    '{"key":"discover","name":"\\ubc1c\\uacac","color":"sky"},'
    '{"key":"plan","name":"\\uacc4\\ud68d","color":"indigo"},'
    '{"key":"deliver","name":"\\uc2e4\\ud589","color":"emerald"},'
    '{"key":"close","name":"\\ub9c8\\uac10","color":"amber"}'
    "]'::jsonb"
)


def upgrade() -> None:
    op.add_column(
        "workspace_profiles",
        sa.Column(
            "project_phase_definitions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_DEFAULT_DEFINITIONS,
        ),
    )
    op.create_check_constraint(
        "workspace_phase_definitions_array",
        "workspace_profiles",
        "jsonb_typeof(project_phase_definitions) = 'array' "
        "AND jsonb_array_length(project_phase_definitions) = 4",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_workspace_profiles_workspace_phase_definitions_array"),
        "workspace_profiles",
        type_="check",
    )
    op.drop_column("workspace_profiles", "project_phase_definitions")
