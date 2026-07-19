import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

PROJECT_PHASE_KEYS: tuple[str, ...] = ("discover", "plan", "deliver", "close")
MAX_ACTIVE_PROJECT_PHASES = 12
MAX_PROJECT_PHASE_DEFINITIONS = 32
DEFAULT_PROJECT_PHASE_DEFINITIONS: tuple[dict[str, str | bool], ...] = (
    {"key": "discover", "name": "발견", "color": "sky", "retired": False},
    {"key": "plan", "name": "계획", "color": "indigo", "retired": False},
    {"key": "deliver", "name": "실행", "color": "emerald", "retired": False},
    {"key": "close", "name": "마감", "color": "amber", "retired": False},
)


def default_project_phase_definitions() -> list[dict[str, str | bool]]:
    return [dict(definition) for definition in DEFAULT_PROJECT_PHASE_DEFINITIONS]


class WorkspaceProfile(Base):
    """The single workspace identity record."""

    __tablename__ = "workspace_profiles"
    __table_args__ = (
        CheckConstraint("id = 1", name="workspace_profile_singleton"),
        CheckConstraint(
            "length(btrim(name)) BETWEEN 1 AND 80",
            name="workspace_profile_name_not_blank",
        ),
        CheckConstraint("revision >= 1", name="workspace_profile_revision_positive"),
        CheckConstraint(
            "jsonb_typeof(working_weekdays) = 'array' "
            "AND jsonb_array_length(working_weekdays) BETWEEN 1 AND 7 "
            "AND working_weekdays <@ '[0, 1, 2, 3, 4, 5, 6]'::jsonb",
            name="workspace_profile_working_weekdays_array",
        ),
        CheckConstraint(
            "jsonb_typeof(holidays) = 'array' AND jsonb_array_length(holidays) <= 366",
            name="workspace_profile_holidays_array",
        ),
        CheckConstraint(
            "jsonb_typeof(project_phase_definitions) = 'array' "
            "AND jsonb_array_length(project_phase_definitions) BETWEEN 4 AND 32",
            name="workspace_phase_definitions_array",
        ),
        CheckConstraint(
            "(logo_storage_key IS NULL AND logo_content_type IS NULL AND logo_filename IS NULL "
            "AND logo_width IS NULL AND logo_height IS NULL AND logo_byte_size IS NULL) "
            "OR (logo_storage_key IS NOT NULL AND logo_content_type IS NOT NULL "
            "AND logo_filename IS NOT NULL AND logo_width IS NOT NULL "
            "AND logo_height IS NOT NULL AND logo_byte_size IS NOT NULL)",
            name="workspace_profile_logo_metadata_complete",
        ),
        CheckConstraint(
            "logo_content_type IS NULL OR logo_content_type IN "
            "('image/png', 'image/jpeg', 'image/webp')",
            name="workspace_profile_logo_content_type",
        ),
        CheckConstraint(
            "logo_width IS NULL OR (logo_width BETWEEN 1 AND 4096 "
            "AND logo_height BETWEEN 1 AND 4096 "
            "AND logo_width * logo_height <= 8000000 "
            "AND logo_byte_size BETWEEN 1 AND 2097152)",
            name="workspace_profile_logo_dimensions",
        ),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    name: Mapped[str] = mapped_column(String(80), nullable=False, default="OneFlow")
    working_weekdays: Mapped[list[int]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: [0, 1, 2, 3, 4],
        server_default="[0, 1, 2, 3, 4]",
    )
    holidays: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default="[]",
    )
    project_phase_definitions: Mapped[list[dict[str, str | bool]]] = mapped_column(
        JSONB,
        nullable=False,
        default=default_project_phase_definitions,
        server_default=text(
            "'["
            '{"key":"discover","name":"발견","color":"sky","retired":false},'
            '{"key":"plan","name":"계획","color":"indigo","retired":false},'
            '{"key":"deliver","name":"실행","color":"emerald","retired":false},'
            '{"key":"close","name":"마감","color":"amber","retired":false}'
            "]'::jsonb"
        ),
    )
    logo_storage_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    logo_content_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    logo_filename: Mapped[str | None] = mapped_column(String(120), nullable=True)
    logo_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    logo_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    logo_byte_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revision: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
