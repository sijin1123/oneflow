"""automation_rules: optional AND secondary condition

Revision ID: 0059
Revises: 0058
Create Date: 2026-07-09

Optional AND secondary condition (Pass 81). Two nullable columns
(condition_field, condition_value); both NULL = no secondary condition
(legacy behavior, existing rows unaffected). A CHECK closes the value
vocabulary per field at the DB level — both-or-neither is absorbed since a
NULL condition_value satisfies none of the OR branches (v81.1 R1-④).
"""

from alembic import op

revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None

# Kept in lockstep with app.models.work_package vocab. Inlined so the migration
# is self-contained (no import-time coupling to app models).
_STATUSES = ("backlog", "todo", "in_progress", "in_review", "done", "cancelled")
_TYPES = ("task", "bug", "feature", "milestone")
_PRIORITIES = ("none", "low", "medium", "high", "urgent")


def _sql_in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


_CONDITION_CHECK = (
    "condition_field IS NULL"
    f" OR (condition_field = 'status' AND condition_value IN ({_sql_in(_STATUSES)}))"
    f" OR (condition_field = 'type' AND condition_value IN ({_sql_in(_TYPES)}))"
    f" OR (condition_field = 'priority' AND condition_value IN ({_sql_in(_PRIORITIES)}))"
)


def upgrade() -> None:
    import sqlalchemy as sa

    op.add_column(
        "automation_rules", sa.Column("condition_field", sa.String(length=30), nullable=True)
    )
    op.add_column(
        "automation_rules", sa.Column("condition_value", sa.String(length=30), nullable=True)
    )
    op.create_check_constraint("automation_condition_allowed", "automation_rules", _CONDITION_CHECK)


def downgrade() -> None:
    op.drop_constraint("automation_condition_allowed", "automation_rules", type_="check")
    op.drop_column("automation_rules", "condition_value")
    op.drop_column("automation_rules", "condition_field")
