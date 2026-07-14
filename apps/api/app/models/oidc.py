import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OidcIdentity(Base):
    """Stable external subject binding for a pre-provisioned OneFlow user."""

    __tablename__ = "oidc_identities"
    __table_args__ = (
        UniqueConstraint("issuer", "subject", name="uq_oidc_identities_issuer_subject"),
        UniqueConstraint("issuer", "user_id", name="uq_oidc_identities_issuer_user"),
        Index("ix_oidc_identities_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    issuer: Mapped[str] = mapped_column(String(512), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class OidcLoginAttempt(Base):
    """Short-lived, single-use server-side PKCE transaction state."""

    __tablename__ = "oidc_login_attempts"
    __table_args__ = (Index("ix_oidc_login_attempts_expires", "expires_at"),)

    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    browser_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    nonce_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    code_verifier: Mapped[str] = mapped_column(String(128), nullable=False)
    next_path: Mapped[str] = mapped_column(String(2048), nullable=False, default="/")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
