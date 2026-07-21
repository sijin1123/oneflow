import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    """users.id (uuid) is the stable identifier; email is a mutable login key,
    never a stable ID (PLAN §5/§7 — OIDC identity mapping arrives in a later PR)."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "(profile_image_storage_key IS NULL AND profile_image_content_type IS NULL "
            "AND profile_image_filename IS NULL AND profile_image_width IS NULL "
            "AND profile_image_height IS NULL AND profile_image_byte_size IS NULL) "
            "OR (profile_image_storage_key IS NOT NULL AND profile_image_content_type IS NOT NULL "
            "AND profile_image_filename IS NOT NULL AND profile_image_width IS NOT NULL "
            "AND profile_image_height IS NOT NULL AND profile_image_byte_size IS NOT NULL)",
            name="user_profile_image_metadata_complete",
        ),
        CheckConstraint(
            "profile_image_content_type IS NULL OR profile_image_content_type IN "
            "('image/png', 'image/jpeg', 'image/webp')",
            name="user_profile_image_content_type",
        ),
        CheckConstraint(
            "profile_image_width IS NULL OR (profile_image_width BETWEEN 1 AND 2048 "
            "AND profile_image_height BETWEEN 1 AND 2048 "
            "AND profile_image_width * profile_image_height <= 4000000 "
            "AND profile_image_byte_size BETWEEN 1 AND 2097152)",
            name="user_profile_image_dimensions",
        ),
        CheckConstraint("profile_revision >= 1", name="user_profile_revision_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    profile_image_storage_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    profile_image_content_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    profile_image_filename: Mapped[str | None] = mapped_column(String(120), nullable=True)
    profile_image_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    profile_image_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    profile_image_byte_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    profile_revision: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=1, server_default=text("1")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    @property
    def profile_image_version(self) -> str | None:
        if self.profile_image_storage_key is None:
            return None
        return self.profile_image_storage_key.rsplit("/", 1)[-1]

    @property
    def profile_image_url(self) -> str | None:
        version = self.profile_image_version
        if version is None:
            return None
        return f"/api/v1/me/profile-image?version={version}"

    def project_profile_image_url(self, project_id: uuid.UUID) -> str | None:
        version = self.profile_image_version
        if version is None:
            return None
        return f"/api/v1/projects/{project_id}/members/{self.id}/profile-image?version={version}"
