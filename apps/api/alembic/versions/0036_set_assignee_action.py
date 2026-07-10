"""automation: admit the set_assignee action

Revision ID: 0036
Revises: 0035
Create Date: 2026-07-07

CHECK widen + action_value length widen to 64 (a UUID string is 36 chars;
VARCHAR widening is metadata-only in PostgreSQL). Raw-SQL CHECK rewrite on the
canonical prefixed name — 0018/0032 pattern.
Ships together with the per-WP execution log (0035) per the Pass 13/16
validator ruling: an ownership-changing action requires an audit trail first.
"""

import sqlalchemy as sa

from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None

_CHECK = "ck_automation_rules_automation_action_allowed"
_OLD = "('set_priority')"
_NEW = "('set_priority', 'set_assignee')"


def upgrade() -> None:
    op.execute(f"ALTER TABLE automation_rules DROP CONSTRAINT {_CHECK}")
    op.execute(
        f"ALTER TABLE automation_rules ADD CONSTRAINT {_CHECK} CHECK (action_type IN {_NEW})"
    )
    op.alter_column("automation_rules", "action_value", type_=sa.String(64))


def downgrade() -> None:
    # DEV/CI ONLY — would fail if set_assignee rules exist (never in smoke).
    op.alter_column("automation_rules", "action_value", type_=sa.String(30))
    op.execute(f"ALTER TABLE automation_rules DROP CONSTRAINT {_CHECK}")
    op.execute(
        f"ALTER TABLE automation_rules ADD CONSTRAINT {_CHECK} CHECK (action_type IN {_OLD})"
    )
