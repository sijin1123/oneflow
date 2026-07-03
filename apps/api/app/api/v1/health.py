"""Probe contract (PLAN §6.1): healthz = liveness (no DB), health = readiness (DB ping).

Never wire /api/v1/health as a container liveness probe — a transient DB outage
must not turn into an app restart loop.
"""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict:
    return {"status": "alive"}


@router.get("/health")
async def health(session: AsyncSession = Depends(get_session)):
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "degraded", "database": "error"})
    return {"status": "ok", "database": "ok"}
