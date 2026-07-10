import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # DB-level UNIQUE — duplicate keys surface as IntegrityError mapped to 409 (PLAN §7).
    key: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Optional project budget for cost roll-up comparison (Phase 3).
    budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    # Archive lifecycle (Pass 2 PR-G): set → project is read-only (writes 409).
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Health report (Pass 37 PR-BC): owner's qualitative status. Closed
    # vocabulary (DB CHECK in 0043); null = unset; the note and audit stamp
    # travel together (clearing health clears all three).
    health: Mapped[str | None] = mapped_column(String(20), nullable=True)
    health_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    health_updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    health_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
