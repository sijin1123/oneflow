"""workspace logo metadata

Revision ID: 0111
Revises: 0110
Create Date: 2026-07-19
"""

import sqlalchemy as sa

from alembic import op

revision = "0111"
down_revision = "0110"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspace_profiles",
        sa.Column("logo_storage_key", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "workspace_profiles",
        sa.Column("logo_content_type", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "workspace_profiles",
        sa.Column("logo_filename", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "workspace_profiles",
        sa.Column("logo_width", sa.Integer(), nullable=True),
    )
    op.add_column(
        "workspace_profiles",
        sa.Column("logo_height", sa.Integer(), nullable=True),
    )
    op.add_column(
        "workspace_profiles",
        sa.Column("logo_byte_size", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "workspace_profile_logo_metadata_complete",
        "workspace_profiles",
        "(logo_storage_key IS NULL AND logo_content_type IS NULL AND logo_filename IS NULL "
        "AND logo_width IS NULL AND logo_height IS NULL AND logo_byte_size IS NULL) "
        "OR (logo_storage_key IS NOT NULL AND logo_content_type IS NOT NULL "
        "AND logo_filename IS NOT NULL AND logo_width IS NOT NULL "
        "AND logo_height IS NOT NULL AND logo_byte_size IS NOT NULL)",
    )
    op.create_check_constraint(
        "workspace_profile_logo_content_type",
        "workspace_profiles",
        "logo_content_type IS NULL OR logo_content_type IN "
        "('image/png', 'image/jpeg', 'image/webp')",
    )
    op.create_check_constraint(
        "workspace_profile_logo_dimensions",
        "workspace_profiles",
        "logo_width IS NULL OR (logo_width BETWEEN 1 AND 4096 "
        "AND logo_height BETWEEN 1 AND 4096 AND logo_width * logo_height <= 8000000 "
        "AND logo_byte_size BETWEEN 1 AND 2097152)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "workspace_profile_logo_dimensions",
        "workspace_profiles",
        type_="check",
    )
    op.drop_constraint(
        "workspace_profile_logo_content_type",
        "workspace_profiles",
        type_="check",
    )
    op.drop_constraint(
        "workspace_profile_logo_metadata_complete",
        "workspace_profiles",
        type_="check",
    )
    op.drop_column("workspace_profiles", "logo_byte_size")
    op.drop_column("workspace_profiles", "logo_height")
    op.drop_column("workspace_profiles", "logo_width")
    op.drop_column("workspace_profiles", "logo_filename")
    op.drop_column("workspace_profiles", "logo_content_type")
    op.drop_column("workspace_profiles", "logo_storage_key")
