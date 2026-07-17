"""custom work-item type keys

Revision ID: 0101
Revises: 0100
Create Date: 2026-07-17

The project_types table remains the project-scoped source of truth. Database
checks accept only built-ins or opaque server-generated custom keys; API fan-in
enforces project membership and active state.
"""

from alembic import op

revision = "0101"
down_revision = "0100"
branch_labels = None
depends_on = None

_TYPE_KEY = "IN ('task', 'bug', 'feature', 'milestone') OR {column} ~ '^custom_[0-9a-f]{{12}}$'"
_APPLIES_TO = (
    "applies_to IS NULL OR ("
    "jsonb_typeof(applies_to) = 'array' "
    "AND jsonb_array_length(applies_to) BETWEEN 1 AND 32 "
    "AND applies_to::text ~ "
    '\'^\\s*\\[\\s*"(task|bug|feature|milestone|custom_[0-9a-f]{12})"'
    '(\\s*,\\s*"(task|bug|feature|milestone|custom_[0-9a-f]{12})")*'
    "\\s*\\]\\s*$')"
)
_CONDITION = (
    "condition_field IS NULL"
    " OR (condition_field = 'status' AND condition_value IN "
    "('backlog','todo','in_progress','in_review','done','cancelled'))"
    " OR (condition_field = 'type' AND (condition_value "
    + _TYPE_KEY.format(column="condition_value")
    + "))"
    " OR (condition_field = 'priority' AND condition_value IN "
    "('none','low','medium','high','urgent'))"
)
_TRIGGER_VALUE = (
    "(trigger_type = 'status_changed_to' AND trigger_value IN "
    "('backlog','todo','in_progress','in_review','done','cancelled'))"
    " OR (trigger_type = 'type_changed_to' AND (trigger_value "
    + _TYPE_KEY.format(column="trigger_value")
    + "))"
    " OR (trigger_type = 'priority_changed_to' AND trigger_value IN "
    "('none','low','medium','high','urgent'))"
)


def upgrade() -> None:
    op.execute("ALTER TABLE project_types DROP CONSTRAINT ck_project_types_key_allowed")
    op.execute(
        "ALTER TABLE project_types ADD CONSTRAINT ck_project_types_key_allowed "
        f"CHECK (key {_TYPE_KEY.format(column='key')})"
    )
    op.execute("ALTER TABLE work_packages DROP CONSTRAINT ck_work_packages_type_allowed")
    op.execute(
        "ALTER TABLE work_packages ADD CONSTRAINT ck_work_packages_type_allowed "
        f"CHECK (type {_TYPE_KEY.format(column='type')})"
    )
    op.execute("ALTER TABLE custom_fields DROP CONSTRAINT ck_custom_fields_applies_to_valid")
    op.execute(
        "ALTER TABLE custom_fields ADD CONSTRAINT ck_custom_fields_applies_to_valid "
        f"CHECK ({_APPLIES_TO})"
    )
    op.execute(
        "ALTER TABLE automation_rules DROP CONSTRAINT "
        "ck_automation_rules_automation_condition_allowed"
    )
    op.execute(
        "ALTER TABLE automation_rules ADD CONSTRAINT "
        "ck_automation_rules_automation_condition_allowed "
        f"CHECK ({_CONDITION})"
    )
    op.execute(
        "ALTER TABLE automation_rules ADD CONSTRAINT "
        "ck_automation_rules_automation_trigger_value_allowed "
        f"CHECK ({_TRIGGER_VALUE})"
    )


def downgrade() -> None:
    # A downgrade must never discard or coerce custom vocabulary. Operators can
    # archive/migrate those rows first, then retry the downgrade intentionally.
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM project_types
            WHERE key NOT IN ('task','bug','feature','milestone')
          ) OR EXISTS (
            SELECT 1 FROM work_packages
            WHERE type NOT IN ('task','bug','feature','milestone')
          ) OR EXISTS (
            SELECT 1 FROM automation_rules
            WHERE (trigger_type = 'type_changed_to' AND trigger_value NOT IN
                   ('task','bug','feature','milestone'))
               OR (condition_field = 'type' AND condition_value NOT IN
                   ('task','bug','feature','milestone'))
          ) OR EXISTS (
            SELECT 1 FROM custom_fields,
            LATERAL jsonb_array_elements_text(COALESCE(applies_to, '[]'::jsonb)) AS value
            WHERE value NOT IN ('task','bug','feature','milestone')
          ) THEN
            RAISE EXCEPTION 'cannot downgrade 0101 while custom work-item type data exists';
          END IF;
        END $$;
        """
    )
    op.execute(
        "ALTER TABLE automation_rules DROP CONSTRAINT "
        "ck_automation_rules_automation_trigger_value_allowed"
    )
    op.execute(
        "ALTER TABLE automation_rules DROP CONSTRAINT "
        "ck_automation_rules_automation_condition_allowed"
    )
    op.execute(
        "ALTER TABLE automation_rules ADD CONSTRAINT "
        "ck_automation_rules_automation_condition_allowed CHECK ("
        "condition_field IS NULL "
        "OR (condition_field = 'status' AND condition_value IN "
        "('backlog','todo','in_progress','in_review','done','cancelled')) "
        "OR (condition_field = 'type' AND condition_value IN "
        "('task','bug','feature','milestone')) "
        "OR (condition_field = 'priority' AND condition_value IN "
        "('none','low','medium','high','urgent')))"
    )
    op.execute("ALTER TABLE custom_fields DROP CONSTRAINT ck_custom_fields_applies_to_valid")
    op.execute(
        "ALTER TABLE custom_fields ADD CONSTRAINT ck_custom_fields_applies_to_valid "
        "CHECK (applies_to IS NULL OR (jsonb_typeof(applies_to) = 'array' AND "
        'applies_to <@ \'["task", "bug", "feature", "milestone"]\'::jsonb))'
    )
    op.execute("ALTER TABLE work_packages DROP CONSTRAINT ck_work_packages_type_allowed")
    op.execute(
        "ALTER TABLE work_packages ADD CONSTRAINT ck_work_packages_type_allowed "
        "CHECK (type IN ('task','bug','feature','milestone'))"
    )
    op.execute("ALTER TABLE project_types DROP CONSTRAINT ck_project_types_key_allowed")
    op.execute(
        "ALTER TABLE project_types ADD CONSTRAINT ck_project_types_key_allowed "
        "CHECK (key IN ('task','bug','feature','milestone'))"
    )
