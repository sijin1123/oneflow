"""automation_rules: type/priority change triggers

Revision ID: 0045
Revises: 0044
Create Date: 2026-07-08

Additive vocabulary. CHECK rewritten via raw SQL (0014 double-prefix trap).
The single-pass engine invariant is untouched: candidates only ever come from
USER-initiated changes, so priority_changed_to + set_priority cannot chain.
"""

from alembic import op

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None

_CONSTRAINT = "ck_automation_rules_automation_trigger_allowed"
_OLD = "('status_changed_to')"
_NEW = "('status_changed_to', 'type_changed_to', 'priority_changed_to')"


def upgrade() -> None:
    op.execute(f"ALTER TABLE automation_rules DROP CONSTRAINT {_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE automation_rules ADD CONSTRAINT {_CONSTRAINT} CHECK (trigger_type IN {_NEW})"
    )


def downgrade() -> None:
    # DEV/CI ONLY — drops rules using the new triggers.
    op.execute(f"DELETE FROM automation_rules WHERE trigger_type NOT IN {_OLD}")
    op.execute(f"ALTER TABLE automation_rules DROP CONSTRAINT {_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE automation_rules ADD CONSTRAINT {_CONSTRAINT} CHECK (trigger_type IN {_OLD})"
    )
