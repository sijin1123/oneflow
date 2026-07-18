"""append-only Initiative activity history

Revision ID: 0107
Revises: 0106
Create Date: 2026-07-18
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0107"
down_revision = "0106"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "initiative_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("initiative_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column(
            "changed_fields",
            postgresql.ARRAY(sa.String(length=24)),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('initiative_created', 'properties_updated', 'lifecycle_updated', "
            "'health_updated', 'owner_transferred', 'owner_claimed', 'labels_updated', "
            "'project_connected', 'project_disconnected', 'work_item_connected', "
            "'work_item_disconnected')",
            name=op.f("ck_initiative_activities_kind_allowed"),
        ),
        sa.CheckConstraint(
            "changed_fields <@ ARRAY['name', 'description', 'state', 'start_date', "
            "'target_date', 'health', 'health_note', 'owner', 'labels', 'projects', "
            "'work_items']::varchar[]",
            name=op.f("ck_initiative_activities_changed_fields_allowed"),
        ),
        sa.CheckConstraint(
            "cardinality(changed_fields) <= 7",
            name=op.f("ck_initiative_activities_changed_fields_bounded"),
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_initiative_activities_actor_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["initiative_id"],
            ["initiatives.id"],
            name=op.f("fk_initiative_activities_initiative_id_initiatives"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_initiative_activities")),
    )
    op.create_index(
        "ix_initiative_activities_initiative_created",
        "initiative_activities",
        ["initiative_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_initiative_activities_initiative_created",
        table_name="initiative_activities",
    )
    op.drop_table("initiative_activities")
