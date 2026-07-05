import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.work_packages import require_wp_member
from app.core.auth import get_current_user
from app.core.authz import member_role
from app.db.session import get_session
from app.models.cost_entry import CostEntry
from app.models.user import User
from app.schemas.cost_entry import CostEntryCreate, CostEntryList, CostEntryRead

router = APIRouter()


@router.get("/work-packages/{wp_id}/cost-entries", response_model=CostEntryList)
async def list_cost_entries(
    wp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CostEntryList:
    await require_wp_member(session, wp_id, user)
    rows = (
        (
            await session.execute(
                select(CostEntry)
                .where(CostEntry.work_package_id == wp_id)
                .order_by(CostEntry.spent_on.asc(), CostEntry.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    total_amount = round(float(sum(float(r.amount) for r in rows)), 2)
    return CostEntryList(
        items=[CostEntryRead.model_validate(r) for r in rows],
        total=len(rows),
        total_amount=total_amount,
    )


@router.post("/work-packages/{wp_id}/cost-entries", response_model=CostEntryRead, status_code=201)
async def log_cost(
    wp_id: uuid.UUID,
    body: CostEntryCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CostEntryRead:
    await require_wp_member(session, wp_id, user)
    entry = CostEntry(
        work_package_id=wp_id,
        user_id=user.id,
        amount=body.amount,
        kind=body.kind,
        spent_on=body.spent_on or date.today(),
        comment=body.comment,
    )
    session.add(entry)
    await session.commit()
    return CostEntryRead.model_validate(entry)


@router.delete("/work-packages/{wp_id}/cost-entries/{entry_id}", status_code=204)
async def delete_cost_entry(
    wp_id: uuid.UUID,
    entry_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    wp = await require_wp_member(session, wp_id, user)
    entry = (
        await session.execute(
            select(CostEntry).where(CostEntry.id == entry_id, CostEntry.work_package_id == wp_id)
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="not found")
    role = await member_role(session, wp.project_id, user.id)
    if entry.user_id != user.id and role != "owner":
        raise HTTPException(status_code=403, detail="only the author or a project owner may delete")
    await session.delete(entry)
    await session.commit()
    return Response(status_code=204)
