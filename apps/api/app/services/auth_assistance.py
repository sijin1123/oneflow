import asyncio
import logging
from contextlib import suppress
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.auth_assistance_request import AuthAssistanceRateLimit, AuthAssistanceRequest

AUTH_ASSISTANCE_RETENTION_DAYS = 90
AUTH_ASSISTANCE_RATE_BUCKET_RETENTION_HOURS = 2
AUTH_ASSISTANCE_RETENTION_INTERVAL_SECONDS = 6 * 60 * 60
logger = logging.getLogger(__name__)


async def redact_expired_auth_assistance(
    session: AsyncSession,
    now: datetime | None = None,
) -> int:
    authoritative_now = now or (await session.execute(select(func.now()))).scalar_one()
    result = await session.execute(
        sa_update(AuthAssistanceRequest)
        .where(
            AuthAssistanceRequest.status.in_({"resolved", "rejected"}),
            AuthAssistanceRequest.triaged_at
            <= authoritative_now - timedelta(days=AUTH_ASSISTANCE_RETENTION_DAYS),
            AuthAssistanceRequest.redacted_at.is_(None),
        )
        .values(
            email=None,
            reason=None,
            triage_note=None,
            redacted_at=authoritative_now,
            updated_at=authoritative_now,
            version=AuthAssistanceRequest.version + 1,
        )
    )
    open_result = await session.execute(
        sa_update(AuthAssistanceRequest)
        .where(
            AuthAssistanceRequest.status.in_({"pending", "in_review"}),
            AuthAssistanceRequest.updated_at
            <= authoritative_now - timedelta(days=AUTH_ASSISTANCE_RETENTION_DAYS),
        )
        .values(
            status="rejected",
            email=None,
            reason=None,
            triage_note=None,
            triaged_at=authoritative_now,
            redacted_at=authoritative_now,
            updated_at=authoritative_now,
            version=AuthAssistanceRequest.version + 1,
        )
    )
    await session.execute(
        delete(AuthAssistanceRateLimit).where(
            AuthAssistanceRateLimit.window_started_at
            <= authoritative_now - timedelta(hours=AUTH_ASSISTANCE_RATE_BUCKET_RETENTION_HOURS)
        )
    )
    return result.rowcount + open_result.rowcount


async def auth_assistance_retention_loop(
    sessionmaker: async_sessionmaker[AsyncSession],
    stop: asyncio.Event,
) -> None:
    while not stop.is_set():
        try:
            async with sessionmaker() as session:
                await redact_expired_auth_assistance(session)
                await session.commit()
        except Exception:
            logger.exception("Authentication assistance retention sweep failed")
        with suppress(TimeoutError):
            await asyncio.wait_for(
                stop.wait(),
                timeout=AUTH_ASSISTANCE_RETENTION_INTERVAL_SECONDS,
            )
