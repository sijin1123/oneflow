import uuid
from datetime import datetime, timedelta
from hashlib import sha256

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy import update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.auth_assistance_request import (
    AUTH_ASSISTANCE_KINDS,
    AUTH_ASSISTANCE_OPEN_STATUSES,
    AUTH_ASSISTANCE_STATUSES,
    AuthAssistanceRateLimit,
    AuthAssistanceRequest,
)
from app.models.user import User
from app.schemas.auth_assistance import (
    AuthAssistanceAccepted,
    AuthAssistanceCreate,
    AuthAssistanceList,
    AuthAssistanceRead,
    AuthAssistanceTriage,
)
from app.services.auth_assistance import redact_expired_auth_assistance

router = APIRouter()
AUTH_ASSISTANCE_SOURCE_LIMIT_PER_HOUR = 100


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="workspace admin required")


def _to_read(row: AuthAssistanceRequest) -> AuthAssistanceRead:
    return AuthAssistanceRead(
        id=row.id,
        kind=row.kind,
        status=row.status,
        email=row.email,
        reason=row.reason,
        submission_count=row.submission_count,
        last_submitted_at=row.last_submitted_at,
        version=row.version,
        triage_note=row.triage_note,
        triaged_by_id=row.triaged_by,
        triaged_at=row.triaged_at,
        redacted_at=row.redacted_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _source_hash(request: Request) -> str:
    source = request.client.host if request.client is not None else "unknown"
    return sha256(source.encode()).hexdigest()


async def _consume_source_capacity(
    session: AsyncSession,
    source_hash: str,
) -> tuple[bool, datetime, AuthAssistanceRateLimit]:
    await session.execute(
        pg_insert(AuthAssistanceRateLimit)
        .values(source_hash=source_hash)
        .on_conflict_do_nothing(index_elements=[AuthAssistanceRateLimit.source_hash])
    )
    bucket = (
        await session.execute(
            select(AuthAssistanceRateLimit)
            .where(AuthAssistanceRateLimit.source_hash == source_hash)
            .with_for_update()
        )
    ).scalar_one()
    now = (await session.execute(select(func.now()))).scalar_one()
    if bucket.window_started_at <= now - timedelta(hours=1):
        bucket.window_started_at = now
        bucket.attempt_count = 0
    if bucket.attempt_count >= AUTH_ASSISTANCE_SOURCE_LIMIT_PER_HOUR:
        return False, now, bucket
    bucket.attempt_count += 1
    return True, now, bucket


@router.post(
    "/auth/assistance-requests",
    response_model=AuthAssistanceAccepted,
    status_code=202,
)
async def submit_auth_assistance(
    body: AuthAssistanceCreate,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> AuthAssistanceAccepted:
    """Accept login help without revealing whether an account exists."""
    response.headers["Cache-Control"] = "no-store"
    active = (
        await session.execute(
            select(AuthAssistanceRequest.id).where(
                AuthAssistanceRequest.kind == body.kind,
                AuthAssistanceRequest.email == body.email,
                AuthAssistanceRequest.status.in_(AUTH_ASSISTANCE_OPEN_STATUSES),
            )
        )
    ).scalar_one_or_none()
    if active is not None:
        return AuthAssistanceAccepted()

    capacity, now, bucket = await _consume_source_capacity(session, _source_hash(request))
    if not capacity:
        await session.commit()
        return AuthAssistanceAccepted()
    inserted = await session.execute(
        pg_insert(AuthAssistanceRequest)
        .values(
            id=uuid.uuid4(),
            kind=body.kind,
            email=body.email,
            reason=body.reason,
            last_submitted_at=now,
        )
        .on_conflict_do_nothing()
        .returning(AuthAssistanceRequest.id)
    )
    if inserted.scalar_one_or_none() is None:
        bucket.attempt_count -= 1
    await session.commit()
    return AuthAssistanceAccepted()


@router.get("/admin/auth-assistance-requests", response_model=AuthAssistanceList)
async def list_auth_assistance(
    response: Response,
    status: str | None = Query(default=None),
    kind: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AuthAssistanceList:
    _require_admin(user)
    response.headers["Cache-Control"] = "private, no-store"
    if status is not None and status not in AUTH_ASSISTANCE_STATUSES:
        raise HTTPException(status_code=422, detail="unsupported assistance status")
    if kind is not None and kind not in AUTH_ASSISTANCE_KINDS:
        raise HTTPException(status_code=422, detail="unsupported assistance kind")
    now = (await session.execute(select(func.now()))).scalar_one()
    await redact_expired_auth_assistance(session, now)
    await session.commit()
    filters = []
    if status is not None:
        filters.append(AuthAssistanceRequest.status == status)
    if kind is not None:
        filters.append(AuthAssistanceRequest.kind == kind)
    total = (
        await session.execute(
            select(func.count()).select_from(AuthAssistanceRequest).where(*filters)
        )
    ).scalar_one()
    rows = (
        (
            await session.execute(
                select(AuthAssistanceRequest)
                .where(*filters)
                .order_by(
                    AuthAssistanceRequest.last_submitted_at.desc(),
                    AuthAssistanceRequest.id.desc(),
                )
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return AuthAssistanceList(
        items=[_to_read(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/admin/auth-assistance-requests/{request_id}",
    response_model=AuthAssistanceRead,
)
async def triage_auth_assistance(
    request_id: uuid.UUID,
    body: AuthAssistanceTriage,
    response: Response,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AuthAssistanceRead:
    _require_admin(user)
    response.headers["Cache-Control"] = "private, no-store"
    current = (
        await session.execute(
            select(AuthAssistanceRequest).where(AuthAssistanceRequest.id == request_id)
        )
    ).scalar_one_or_none()
    if current is None:
        raise HTTPException(status_code=404, detail="not found")
    if current.status not in AUTH_ASSISTANCE_OPEN_STATUSES:
        raise HTTPException(status_code=409, detail="the request already has a final decision")
    if body.status == current.status:
        raise HTTPException(status_code=422, detail="the request status must change")
    allowed = {
        "pending": {"in_review", "resolved", "rejected"},
        "in_review": {"resolved", "rejected"},
    }
    if body.status not in allowed[current.status]:
        raise HTTPException(status_code=422, detail="unsupported assistance transition")
    result = await session.execute(
        sa_update(AuthAssistanceRequest)
        .where(
            AuthAssistanceRequest.id == request_id,
            AuthAssistanceRequest.version == body.expected_version,
            AuthAssistanceRequest.status.in_(AUTH_ASSISTANCE_OPEN_STATUSES),
        )
        .values(
            status=body.status,
            triage_note=body.note,
            triaged_by=user.id,
            triaged_at=func.now(),
            version=AuthAssistanceRequest.version + 1,
            updated_at=func.now(),
        )
        .returning(AuthAssistanceRequest.id)
    )
    if result.scalar_one_or_none() is None:
        await session.rollback()
        raise HTTPException(status_code=409, detail="the request version is stale")
    await session.commit()
    fresh = (
        await session.execute(
            select(AuthAssistanceRequest).where(AuthAssistanceRequest.id == request_id)
        )
    ).scalar_one()
    return _to_read(fresh)


@router.delete("/admin/auth-assistance-requests/{request_id}", status_code=204)
async def redact_auth_assistance(
    request_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    _require_admin(user)
    current = (
        await session.execute(
            select(AuthAssistanceRequest).where(AuthAssistanceRequest.id == request_id)
        )
    ).scalar_one_or_none()
    if current is None:
        raise HTTPException(status_code=404, detail="not found")
    if current.status in AUTH_ASSISTANCE_OPEN_STATUSES:
        raise HTTPException(status_code=409, detail="finish triage before redacting contact data")
    if current.redacted_at is None:
        current.email = None
        current.reason = None
        current.triage_note = None
        current.redacted_at = (await session.execute(select(func.now()))).scalar_one()
        current.updated_at = current.redacted_at
        current.version += 1
    await session.commit()
    return Response(status_code=204, headers={"Cache-Control": "private, no-store"})
