"""Per-project workflow status configuration (PLAN §3 Phase 3 워크플로우 커스터마이징).

Members read the configuration (labels/order drive the board and chips); owners
rename and reorder statuses. Status keys are fixed, so work_packages.status keeps
its existing validation — this is a presentation/config layer only.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.project_status import ProjectStatus
from app.models.user import User
from app.schemas.project_status import (
    ProjectStatusList,
    ProjectStatusRead,
    ProjectStatusReorder,
    ProjectStatusUpdate,
)

router = APIRouter()


@router.get("/projects/{project_id}/statuses", response_model=ProjectStatusList)
async def list_project_statuses(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectStatusList:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(ProjectStatus)
                .where(ProjectStatus.project_id == project_id)
                .order_by(ProjectStatus.position.asc(), ProjectStatus.key.asc())
            )
        )
        .scalars()
        .all()
    )
    return ProjectStatusList(
        items=[ProjectStatusRead.model_validate(r) for r in rows], total=len(rows)
    )


@router.put("/projects/{project_id}/statuses/order", response_model=ProjectStatusList)
async def reorder_project_statuses(
    project_id: uuid.UUID,
    body: ProjectStatusReorder,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectStatusList:
    """Owner-only atomic reorder. The body must list exactly the project's status
    ids; positions are rewritten 0..n-1 in one transaction."""
    await require_role(session, project_id, user, {"owner"}, write=True)
    rows = (
        (await session.execute(select(ProjectStatus).where(ProjectStatus.project_id == project_id)))
        .scalars()
        .all()
    )
    by_id = {r.id: r for r in rows}
    if set(body.ordered_ids) != set(by_id):
        raise HTTPException(
            status_code=422, detail="ordered_ids must list exactly this project's statuses"
        )
    for position, status_id in enumerate(body.ordered_ids):
        by_id[status_id].position = position
    await session.commit()
    ordered = sorted(rows, key=lambda r: r.position)
    return ProjectStatusList(
        items=[ProjectStatusRead.model_validate(r) for r in ordered], total=len(ordered)
    )


@router.patch("/projects/{project_id}/statuses/{status_id}", response_model=ProjectStatusRead)
async def update_project_status(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    body: ProjectStatusUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectStatusRead:
    # Owner-only: 404 for non-members, 403 for members without the owner role.
    await require_role(session, project_id, user, {"owner"}, write=True)
    row = (
        await session.execute(
            select(ProjectStatus).where(
                ProjectStatus.id == status_id, ProjectStatus.project_id == project_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")

    provided = body.model_fields_set
    if "name" in provided and body.name is not None:
        row.name = body.name
    if "position" in provided and body.position is not None:
        row.position = body.position
    await session.commit()
    await session.refresh(row)
    return ProjectStatusRead.model_validate(row)
