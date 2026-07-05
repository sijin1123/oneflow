"""Async engine and session-per-request dependency (PLAN §5 transaction boundary)."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings


def build_engine(settings: Settings):
    return create_async_engine(
        settings.database_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
    )


def build_sessionmaker(engine) -> async_sessionmaker[AsyncSession]:
    # expire_on_commit=False: responses are serialized after commit (PLAN §5).
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Overridden per-app in create_app(); a fresh AsyncSession per request."""
    raise NotImplementedError("get_session must be wired by create_app()")
