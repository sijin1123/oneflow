"""fix double-prefixed CHECK constraint names

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-05

Migrations 0001–0004 passed CHECK constraint names that were already prefixed with
``ck_<table>_`` while the metadata naming convention (``ck_%(table_name)s_%(constraint_name)s``)
re-applied the prefix, so the real DB names came out double-prefixed
(``ck_<table>_ck_<table>_<suffix>``) — and, for the long relations name, truncated
with a deterministic hash suffix. That diverges from what the models declare, so the
first future migration that alters one of these CHECKs by its canonical name would
fail with "constraint does not exist" (fable5 audit, DB finding #1). This migration
renames each to the canonical single-prefixed name the models expect.
"""

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

# (table, current double-prefixed name, canonical name from model metadata)
_RENAMES = [
    (
        "project_members",
        "ck_project_members_ck_project_members_role_allowed",
        "ck_project_members_role_allowed",
    ),
    (
        "work_packages",
        "ck_work_packages_ck_work_packages_type_allowed",
        "ck_work_packages_type_allowed",
    ),
    (
        "work_packages",
        "ck_work_packages_ck_work_packages_status_allowed",
        "ck_work_packages_status_allowed",
    ),
    (
        "work_packages",
        "ck_work_packages_ck_work_packages_priority_allowed",
        "ck_work_packages_priority_allowed",
    ),
    (
        "work_packages",
        "ck_work_packages_ck_work_packages_parent_not_self",
        "ck_work_packages_parent_not_self",
    ),
    (
        "work_package_relations",
        "ck_work_package_relations_ck_work_package_relations_not_self",
        "ck_work_package_relations_not_self",
    ),
    # The original convention name exceeded 63 chars, so SQLAlchemy truncated it to
    # this deterministic hashed form on CREATE.
    (
        "work_package_relations",
        "ck_work_package_relations_ck_work_package_relations_rel_ee03",
        "ck_work_package_relations_relation_type_allowed",
    ),
    ("activities", "ck_activities_ck_activities_action_allowed", "ck_activities_action_allowed"),
    ("time_entries", "ck_time_entries_ck_time_entries_hours_range", "ck_time_entries_hours_range"),
    (
        "cost_entries",
        "ck_cost_entries_ck_cost_entries_amount_range",
        "ck_cost_entries_amount_range",
    ),
    (
        "cost_entries",
        "ck_cost_entries_ck_cost_entries_kind_allowed",
        "ck_cost_entries_kind_allowed",
    ),
]


def upgrade() -> None:
    for table, current, canonical in _RENAMES:
        op.execute(f'ALTER TABLE {table} RENAME CONSTRAINT "{current}" TO "{canonical}"')


def downgrade() -> None:
    for table, current, canonical in _RENAMES:
        op.execute(f'ALTER TABLE {table} RENAME CONSTRAINT "{canonical}" TO "{current}"')
