import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

PROJECT_PHASE_KEYS: tuple[str, ...] = ("discover", "plan", "deliver", "close")
DEFAULT_PROJECT_PHASE_DEFINITIONS: tuple[dict[str, str], ...] = (
    {"key": "discover", "name": "발견", "color": "sky"},
    {"key": "plan", "name": "계획", "color": "indigo"},
    {"key": "deliver", "name": "실행", "color": "emerald"},
    {"key": "close", "name": "마감", "color": "amber"},
)


def default_project_phase_definitions() -> list[dict[str, str]]:
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
            "AND jsonb_array_length(project_phase_definitions) = 4",
            name="workspace_phase_definitions_array",
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
    project_phase_definitions: Mapped[list[dict[str, str]]] = mapped_column(
        JSONB,
        nullable=False,
        default=default_project_phase_definitions,
        server_default=text(
            "'["
            '{"key":"discover","name":"발견","color":"sky"},'
            '{"key":"plan","name":"계획","color":"indigo"},'
            '{"key":"deliver","name":"실행","color":"emerald"},'
            '{"key":"close","name":"마감","color":"amber"}'
            "]'::jsonb"
        ),
    )
    revision: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
