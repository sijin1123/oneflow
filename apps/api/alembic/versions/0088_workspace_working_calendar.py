"""workspace working calendar

Revision ID: 0088
Revises: 0087
Create Date: 2026-07-15
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0088"
down_revision = "0087"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspace_profiles",
        sa.Column(
            "working_weekdays",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[0, 1, 2, 3, 4]'::jsonb"),
        ),
    )
    op.add_column(
        "workspace_profiles",
        sa.Column(
            "holidays",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.create_check_constraint(
        "workspace_profile_working_weekdays_array",
        "workspace_profiles",
        "jsonb_typeof(working_weekdays) = 'array' "
        "AND jsonb_array_length(working_weekdays) BETWEEN 1 AND 7 "
        "AND working_weekdays <@ '[0, 1, 2, 3, 4, 5, 6]'::jsonb",
    )
    op.create_check_constraint(
        "workspace_profile_holidays_array",
        "workspace_profiles",
        "jsonb_typeof(holidays) = 'array' AND jsonb_array_length(holidays) <= 366",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_workspace_profiles_workspace_profile_holidays_array"),
        "workspace_profiles",
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_workspace_profiles_workspace_profile_working_weekdays_array"),
        "workspace_profiles",
        type_="check",
    )
    op.drop_column("workspace_profiles", "holidays")
    op.drop_column("workspace_profiles", "working_weekdays")
