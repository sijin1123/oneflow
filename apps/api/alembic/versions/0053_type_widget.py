"""dashboard_layouts: type_distribution widget key

Revision ID: 0053
Revises: 0052
Create Date: 2026-07-08

Additive vocabulary (the 0032/0044 CHECK-rewrite precedent; raw SQL for the
0014 double-prefix trap). The absent-row default grows to seven widgets;
saved layouts are untouched.
"""

from alembic import op

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None

_CONSTRAINT = "ck_dashboard_layouts_widgets_valid"
_OLD = (
    '["summary", "budget", "progress", "status_distribution", '
    '"priority_distribution", "recent_activity"]'
)
_NEW = (
    '["summary", "budget", "progress", "status_distribution", '
    '"priority_distribution", "type_distribution", "recent_activity"]'
)
_BASE = "jsonb_typeof(widgets) = 'array' AND jsonb_array_length(widgets) >= 1 AND widgets <@ "


def upgrade() -> None:
    op.execute(f"ALTER TABLE dashboard_layouts DROP CONSTRAINT {_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE dashboard_layouts ADD CONSTRAINT {_CONSTRAINT} CHECK ({_BASE}'{_NEW}'::jsonb)"
    )


def downgrade() -> None:
    # DEV/CI ONLY — strips the new key from saved layouts before restoring.
    op.execute("UPDATE dashboard_layouts SET widgets = widgets - 'type_distribution'")
    op.execute("DELETE FROM dashboard_layouts WHERE jsonb_array_length(widgets) = 0")
    op.execute(f"ALTER TABLE dashboard_layouts DROP CONSTRAINT {_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE dashboard_layouts ADD CONSTRAINT {_CONSTRAINT} CHECK ({_BASE}'{_OLD}'::jsonb)"
    )
