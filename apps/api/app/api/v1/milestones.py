import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member
from app.db.session import get_session
from app.models.milestone import Milestone
from app.models.user import User
from app.schemas.milestone import (
    MilestoneCreate,
    MilestoneList,
    MilestoneRead,
    MilestoneUpdate,
)

router = APIRouter()


async def _get_scoped(session: AsyncSession, project_id: uuid.UUID, milestone_id: uuid.UUID):
    m = (
        await session.execute(select(Milestone).where(Milestone.id == milestone_id))
    ).scalar_one_or_none()
    if m is None or m.project_id != project_id:
        raise HTTPException(status_code=404, detail="not found")
    return m


@router.get("/projects/{project_id}/milestones", response_model=MilestoneList)
async def list_milestones(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MilestoneList:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(Milestone)
                .where(Milestone.project_id == project_id)
                .order_by(Milestone.due_date.asc().nulls_last(), Milestone.name.asc())
            )
        )
        .scalars()
        .all()
    )
    return MilestoneList(items=[MilestoneRead.model_validate(m) for m in rows], total=len(rows))


@router.post("/projects/{project_id}/milestones", response_model=MilestoneRead, status_code=201)
async def create_milestone(
    project_id: uuid.UUID,
    body: MilestoneCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MilestoneRead:
    await require_member(session, project_id, user)
    m = Milestone(
        project_id=project_id,
        name=body.name,
        description=body.description,
        due_date=body.due_date,
    )
    session.add(m)
    await session.commit()
    return MilestoneRead.model_validate(m)


@router.patch("/projects/{project_id}/milestones/{milestone_id}", response_model=MilestoneRead)
async def update_milestone(
    project_id: uuid.UUID,
    milestone_id: uuid.UUID,
    body: MilestoneUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MilestoneRead:
    await require_member(session, project_id, user)
    m = await _get_scoped(session, project_id, milestone_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(m, key, value)
    await session.commit()
    await session.refresh(m)  # onupdate updated_at is server-computed
    return MilestoneRead.model_validate(m)


@router.delete("/projects/{project_id}/milestones/{milestone_id}", status_code=204)
async def delete_milestone(
    project_id: uuid.UUID,
    milestone_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_member(session, project_id, user)
    m = await _get_scoped(session, project_id, milestone_id)
    await session.delete(m)  # work_packages.milestone_id SET NULL via FK
    await session.commit()
    return Response(status_code=204)
