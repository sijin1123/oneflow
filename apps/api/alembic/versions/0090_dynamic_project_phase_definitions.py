"""dynamic workspace project phase definitions

Revision ID: 0090
Revises: 0089
Create Date: 2026-07-15
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0090"
down_revision = "0089"
branch_labels = None
depends_on = None

_DYNAMIC_DEFAULT = sa.text(
    "'["
    '{"key":"discover","name":"\\ubc1c\\uacac","color":"sky","retired": false},'
    '{"key":"plan","name":"\\uacc4\\ud68d","color":"indigo","retired": false},'
    '{"key":"deliver","name":"\\uc2e4\\ud589","color":"emerald","retired": false},'
    '{"key":"close","name":"\\ub9c8\\uac10","color":"amber","retired": false}'
    "]'::jsonb"
)
_FIXED_DEFAULT = sa.text(
    "'["
    '{"key":"discover","name":"\\ubc1c\\uacac","color":"sky"},'
    '{"key":"plan","name":"\\uacc4\\ud68d","color":"indigo"},'
    '{"key":"deliver","name":"\\uc2e4\\ud589","color":"emerald"},'
    '{"key":"close","name":"\\ub9c8\\uac10","color":"amber"}'
    "]'::jsonb"
)


def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_workspace_profiles_workspace_phase_definitions_array"),
        "workspace_profiles",
        type_="check",
    )
    op.execute(
        """
        UPDATE workspace_profiles
        SET project_phase_definitions = (
          SELECT jsonb_agg(definition || '{"retired": false}'::jsonb ORDER BY ordinal)
          FROM jsonb_array_elements(project_phase_definitions)
               WITH ORDINALITY AS value(definition, ordinal)
        )
        """
    )
    op.alter_column(
        "workspace_profiles",
        "project_phase_definitions",
        existing_type=postgresql.JSONB(),
        server_default=_DYNAMIC_DEFAULT,
        existing_nullable=False,
    )
    op.create_check_constraint(
        "workspace_phase_definitions_array",
        "workspace_profiles",
        "jsonb_typeof(project_phase_definitions) = 'array' "
        "AND jsonb_array_length(project_phase_definitions) BETWEEN 4 AND 32",
    )

    op.drop_constraint(
        op.f("ck_project_phases_key_allowed"),
        "project_phases",
        type_="check",
    )
    op.alter_column(
        "project_phases",
        "key",
        existing_type=sa.String(length=20),
        type_=sa.String(length=48),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "key_allowed",
        "project_phases",
        "key IN ('discover', 'plan', 'deliver', 'close') OR key ~ '^custom_[0-9a-f]{32}$'",
    )


def downgrade() -> None:
    connection = op.get_bind()
    custom_definition_exists = connection.execute(
        sa.text(
            """
            SELECT EXISTS (
              SELECT 1
              FROM workspace_profiles,
                   jsonb_array_elements(project_phase_definitions) AS definition
              WHERE definition->>'key' NOT IN ('discover', 'plan', 'deliver', 'close')
            )
            """
        )
    ).scalar_one()
    custom_project_phase_exists = connection.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM project_phases "
            "WHERE key NOT IN ('discover', 'plan', 'deliver', 'close'))"
        )
    ).scalar_one()
    if custom_definition_exists or custom_project_phase_exists:
        raise RuntimeError("cannot downgrade 0090 while custom project phase data exists")

    op.drop_constraint(
        op.f("ck_project_phases_key_allowed"),
        "project_phases",
        type_="check",
    )
    op.alter_column(
        "project_phases",
        "key",
        existing_type=sa.String(length=48),
        type_=sa.String(length=20),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "key_allowed",
        "project_phases",
        "key IN ('discover', 'plan', 'deliver', 'close')",
    )

    op.drop_constraint(
        op.f("ck_workspace_profiles_workspace_phase_definitions_array"),
        "workspace_profiles",
        type_="check",
    )
    op.execute(
        """
        UPDATE workspace_profiles
        SET project_phase_definitions = (
          SELECT jsonb_agg(definition - 'retired' ORDER BY ordinal)
          FROM jsonb_array_elements(project_phase_definitions)
               WITH ORDINALITY AS value(definition, ordinal)
        )
        """
    )
    op.alter_column(
        "workspace_profiles",
        "project_phase_definitions",
        existing_type=postgresql.JSONB(),
        server_default=_FIXED_DEFAULT,
        existing_nullable=False,
    )
    op.create_check_constraint(
        "workspace_phase_definitions_array",
        "workspace_profiles",
        "jsonb_typeof(project_phase_definitions) = 'array' "
        "AND jsonb_array_length(project_phase_definitions) = 4",
    )
