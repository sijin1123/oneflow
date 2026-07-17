import re
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Built-in keys remain stable for compatibility. Custom keys are opaque,
# server-generated identifiers so a rename never rewrites work-item history.
DEFAULT_TYPES: tuple[tuple[str, str, int], ...] = (
    ("task", "작업", 0),
    ("bug", "버그", 1),
    ("feature", "기능", 2),
    ("milestone", "마일스톤", 3),
)
BUILTIN_TYPE_KEYS = tuple(key for key, _name, _position in DEFAULT_TYPES)
CUSTOM_TYPE_KEY_PATTERN = r"custom_[0-9a-f]{12}"
TYPE_KEY_PATTERN = rf"^(?:{'|'.join(BUILTIN_TYPE_KEYS)}|{CUSTOM_TYPE_KEY_PATTERN})$"
TYPE_KEY_SQL = "key IN ('task', 'bug', 'feature', 'milestone') OR key ~ '^custom_[0-9a-f]{12}$'"
MAX_PROJECT_TYPES = 32
MAX_ACTIVE_PROJECT_TYPES = 12


def is_valid_type_key(value: str) -> bool:
    return re.fullmatch(TYPE_KEY_PATTERN, value) is not None


class ProjectType(Base):
    """Per-project label + ordering + enablement for a work-item type key.

    Rolling-deploy fallback: a project with NO rows (created by pre-Pass-7 code
    in the deploy window) treats every type as enabled — validation only bites
    once the rows exist (backfill is idempotent)."""

    __tablename__ = "project_types"
    __table_args__ = (
        UniqueConstraint("project_id", "key", name="uq_project_types_project_key"),
        CheckConstraint(TYPE_KEY_SQL, name="key_allowed"),
        Index("ix_project_types_project", "project_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    @property
    def is_builtin(self) -> bool:
        return self.key in BUILTIN_TYPE_KEYS
