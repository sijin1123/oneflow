import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.work_packages import require_wp_member
from app.core.auth import get_current_user
from app.core.authz import member_role
from app.db.session import get_session
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.schemas.time_entry import TimeEntryCreate, TimeEntryList, TimeEntryRead

router = APIRouter()


@router.get("/work-packages/{wp_id}/time-entries", response_model=TimeEntryList)
async def list_time_entries(
    wp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> TimeEntryList:
    await require_wp_member(session, wp_id, user)
    rows = (
        (
            await session.execute(
                select(TimeEntry)
                .where(TimeEntry.work_package_id == wp_id)
                .order_by(TimeEntry.spent_on.asc(), TimeEntry.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    total_hours = float(sum(float(r.hours) for r in rows))
    return TimeEntryList(
        items=[TimeEntryRead.model_validate(r) for r in rows],
        total=len(rows),
        total_hours=round(total_hours, 2),
    )


@router.post("/work-packages/{wp_id}/time-entries", response_model=TimeEntryRead, status_code=201)
async def log_time(
    wp_id: uuid.UUID,
    body: TimeEntryCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> TimeEntryRead:
    await require_wp_member(session, wp_id, user)
    entry = TimeEntry(
        work_package_id=wp_id,
        user_id=user.id,
        hours=body.hours,
        spent_on=body.spent_on or date.today(),
        comment=body.comment,
    )
    session.add(entry)
    await session.commit()
    return TimeEntryRead.model_validate(entry)


@router.delete("/work-packages/{wp_id}/time-entries/{entry_id}", status_code=204)
async def delete_time_entry(
    wp_id: uuid.UUID,
    entry_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    wp = await require_wp_member(session, wp_id, user)
    entry = (
        await session.execute(
            select(TimeEntry).where(TimeEntry.id == entry_id, TimeEntry.work_package_id == wp_id)
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="not found")
    # The author may delete their own entry; a project owner may delete any.
    role = await member_role(session, wp.project_id, user.id)
    if entry.user_id != user.id and role != "owner":
        raise HTTPException(status_code=403, detail="only the author or a project owner may delete")
    await session.delete(entry)
    await session.commit()
    return Response(status_code=204)
