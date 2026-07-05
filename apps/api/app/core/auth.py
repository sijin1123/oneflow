"""Authentication dependency (PLAN §5).

dev mode: returns the fixed dev user, auto-provisioned via an atomic upsert
(INSERT .. ON CONFLICT DO NOTHING, then re-select) so two concurrent first
requests on a fresh DB cannot race into a unique-violation 500.
oidc mode: explicit 501 — never a silent bypass.
"""

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.user import User

DEV_USER_EMAIL = "dev@oneflow.local"
DEV_USER_NAME = "Dev User"


async def get_current_user(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    if settings.auth_mode == "oidc":
        raise HTTPException(status_code=501, detail="oidc auth mode is not implemented yet")
    # dev mode is only reachable in development/test (startup guard §9).
    user = (
        await session.execute(select(User).where(User.email == DEV_USER_EMAIL))
    ).scalar_one_or_none()
    if user is None:
        stmt = (
            pg_insert(User)
            .values(email=DEV_USER_EMAIL, display_name=DEV_USER_NAME, is_active=True)
            .on_conflict_do_nothing(index_elements=[User.email])
        )
        await session.execute(stmt)
        await session.commit()
        user = (
            await session.execute(select(User).where(User.email == DEV_USER_EMAIL))
        ).scalar_one()
    return user
