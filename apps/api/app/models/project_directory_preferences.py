import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

PROJECT_DIRECTORY_COLUMNS = (
    "initiatives",
    "work_package_count",
    "open_work_package_count",
    "overdue_count",
    "member_count",
)


class UserProjectDirectoryPreferences(Base):
    """The caller-owned project directory presentation preferences.

    An absent row means the built-in defaults. Empty columns are valid because
    a user may intentionally keep the project card/list surface minimal.
    """

    __tablename__ = "user_project_directory_preferences"
    __table_args__ = (
        CheckConstraint(
            "jsonb_typeof(columns) = 'array' AND columns <@ "
            '\'["initiatives", "work_package_count", "open_work_package_count", '
            '"overdue_count", "member_count"]\'::jsonb',
            name="columns_valid",
        ),
        CheckConstraint(
            "sort_key IN ('default', 'name', 'work_package_count', "
            "'open_work_package_count', 'overdue_count', 'member_count', 'health')",
            name="sort_key_valid",
        ),
        CheckConstraint(
            "sort_direction IN ('asc', 'desc')",
            name="sort_direction_valid",
        ),
        CheckConstraint("layout IN ('grid', 'list')", name="layout_valid"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    columns: Mapped[list] = mapped_column(JSONB, nullable=False)
    sort_key: Mapped[str] = mapped_column(String(32), nullable=False)
    sort_direction: Mapped[str] = mapped_column(String(4), nullable=False)
    layout: Mapped[str] = mapped_column(String(8), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
