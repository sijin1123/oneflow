"""user profile image lifecycle

Revision ID: 0114
Revises: 0113
Create Date: 2026-07-21
"""

import sqlalchemy as sa

from alembic import op

revision = "0114"
down_revision = "0113"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("profile_image_storage_key", sa.String(80), nullable=True))
    op.add_column("users", sa.Column("profile_image_content_type", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("profile_image_filename", sa.String(120), nullable=True))
    op.add_column("users", sa.Column("profile_image_width", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("profile_image_height", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("profile_image_byte_size", sa.Integer(), nullable=True))
    op.add_column(
        "users",
        sa.Column("profile_revision", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
    )
    op.create_check_constraint(
        "user_profile_image_metadata_complete",
        "users",
        "(profile_image_storage_key IS NULL AND profile_image_content_type IS NULL "
        "AND profile_image_filename IS NULL AND profile_image_width IS NULL "
        "AND profile_image_height IS NULL AND profile_image_byte_size IS NULL) "
        "OR (profile_image_storage_key IS NOT NULL AND profile_image_content_type IS NOT NULL "
        "AND profile_image_filename IS NOT NULL AND profile_image_width IS NOT NULL "
        "AND profile_image_height IS NOT NULL AND profile_image_byte_size IS NOT NULL)",
    )
    op.create_check_constraint(
        "user_profile_image_content_type",
        "users",
        "profile_image_content_type IS NULL OR profile_image_content_type IN "
        "('image/png', 'image/jpeg', 'image/webp')",
    )
    op.create_check_constraint(
        "user_profile_image_dimensions",
        "users",
        "profile_image_width IS NULL OR (profile_image_width BETWEEN 1 AND 2048 "
        "AND profile_image_height BETWEEN 1 AND 2048 "
        "AND profile_image_width * profile_image_height <= 4000000 "
        "AND profile_image_byte_size BETWEEN 1 AND 2097152)",
    )
    op.create_check_constraint(
        "user_profile_revision_positive", "users", "profile_revision >= 1"
    )


def downgrade() -> None:
    op.drop_constraint("user_profile_revision_positive", "users", type_="check")
    op.drop_constraint("user_profile_image_dimensions", "users", type_="check")
    op.drop_constraint("user_profile_image_content_type", "users", type_="check")
    op.drop_constraint("user_profile_image_metadata_complete", "users", type_="check")
    op.drop_column("users", "profile_revision")
    op.drop_column("users", "profile_image_byte_size")
    op.drop_column("users", "profile_image_height")
    op.drop_column("users", "profile_image_width")
    op.drop_column("users", "profile_image_filename")
    op.drop_column("users", "profile_image_content_type")
    op.drop_column("users", "profile_image_storage_key")
