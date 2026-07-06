"""cycles + work_packages.cycle_id (composite same-project FK)

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-06

Additive only (new table + nullable column): forward-only in production — on a
bad deploy, revert the code and LEAVE this schema in place; old code never
touches it. The downgrade below exists for the dev/CI migrate smoke and DROPS
all cycle data and every work_packages.cycle_id value — never run it against a
database whose cycle data matters.
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cycles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        # Short name only: the metadata naming convention adds the ck_cycles_
        # prefix — pre-prefixing would double it (see migration 0014).
        sa.CheckConstraint("start_date <= end_date", name="date_order"),
        sa.UniqueConstraint("id", "project_id", name="uq_cycles_id_project"),
    )
    op.create_index("ix_cycles_project", "cycles", ["project_id", "start_date"])

    op.add_column("work_packages", sa.Column("cycle_id", UUID(as_uuid=True), nullable=True))
    # Composite FK: cross-project cycle assignment is unrepresentable even for
    # writes that bypass the API. PG15+ column-list SET NULL clears only cycle_id
    # on cycle delete (raw SQL — same pattern as the parent_id FK in 0001).
    op.execute(
        "ALTER TABLE work_packages "
        "ADD CONSTRAINT fk_work_packages_cycle_project "
        "FOREIGN KEY (cycle_id, project_id) REFERENCES cycles (id, project_id) "
        "ON DELETE SET NULL (cycle_id)"
    )
    op.create_index("ix_work_packages_cycle", "work_packages", ["cycle_id"])


def downgrade() -> None:
    # DEV/CI ONLY — drops cycles and every work_packages.cycle_id assignment.
    op.drop_index("ix_work_packages_cycle", table_name="work_packages")
    op.drop_constraint("fk_work_packages_cycle_project", "work_packages", type_="foreignkey")
    op.drop_column("work_packages", "cycle_id")
    op.drop_index("ix_cycles_project", table_name="cycles")
    op.drop_table("cycles")
