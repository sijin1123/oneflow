import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member
from app.db.session import get_session
from app.models.milestone import Milestone
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.milestone import (
    MilestoneCreate,
    MilestoneList,
    MilestoneRead,
    MilestoneUpdate,
)
from app.services.workspace_features import RELEASES_FEATURE, feature_enabled, feature_policy


async def _require_releases_enabled(
    session: AsyncSession = Depends(get_session),
) -> None:
    if not await feature_enabled(session, RELEASES_FEATURE):
        raise HTTPException(status_code=404, detail="not found")


async def _lock_releases_enabled(session: AsyncSession) -> None:
    if not (await feature_policy(session, RELEASES_FEATURE, for_update=True)).enabled:
        raise HTTPException(status_code=404, detail="not found")


router = APIRouter(dependencies=[Depends(_require_releases_enabled)])


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
    # Progress rollup: one COUNT FILTER aggregate, scoped to THIS project's
    # milestones (project_id in the WHERE — cross-project rows can never bleed
    # in even if a milestone id collided, v30.1).
    agg: dict = {}
    if rows:
        closed = WorkPackage.status.in_(WP_CLOSED_STATUSES)
        agg_rows = (
            await session.execute(
                select(
                    WorkPackage.milestone_id,
                    func.count().label("total"),
                    func.count().filter(closed).label("done"),
                )
                .where(
                    WorkPackage.project_id == project_id,
                    WorkPackage.milestone_id.in_([m.id for m in rows]),
                )
                .group_by(WorkPackage.milestone_id)
            )
        ).all()
        agg = {mid: (t, d) for mid, t, d in agg_rows}
    items = []
    for m in rows:
        item = MilestoneRead.model_validate(m)
        item.work_package_count, item.done_work_package_count = agg.get(m.id, (0, 0))
        items.append(item)
    return MilestoneList(items=items, total=len(items))


@router.post("/projects/{project_id}/milestones", response_model=MilestoneRead, status_code=201)
async def create_milestone(
    project_id: uuid.UUID,
    body: MilestoneCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MilestoneRead:
    await require_member(session, project_id, user, write=True)
    await _lock_releases_enabled(session)
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
    await require_member(session, project_id, user, write=True)
    await _lock_releases_enabled(session)
    m = await _get_scoped(session, project_id, milestone_id)
    fields = body.model_dump(exclude_unset=True)
    # `name` is NOT NULL: an explicit null is a client error (422), never an
    # unhandled IntegrityError → 500 (fable5 audit: PATCH null-semantics).
    if "name" in fields and fields["name"] is None:
        raise HTTPException(status_code=422, detail="name cannot be null")
    for key, value in fields.items():
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
    await require_member(session, project_id, user, write=True)
    await _lock_releases_enabled(session)
    m = await _get_scoped(session, project_id, milestone_id)
    await session.delete(m)  # work_packages.milestone_id SET NULL via FK
    await session.commit()
    return Response(status_code=204)
