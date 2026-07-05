import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import authorize, require_member, require_role
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectList, ProjectRead, ProjectUpdate

router = APIRouter()


def _member_project_ids(user: User):
    return select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)


@router.get("", response_model=ProjectList)
async def list_projects(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectList:
    base = select(Project).where(Project.id.in_(_member_project_ids(user)))
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        (
            await session.execute(
                base.order_by(Project.created_at.asc(), Project.id.asc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return ProjectList(items=[ProjectRead.model_validate(p) for p in rows], total=total)


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(
    body: ProjectCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    if not authorize(user, "project:create"):
        raise HTTPException(status_code=404, detail="not found")
    # id is assigned client-side up front — column defaults fire only at flush,
    # and the membership row below needs the FK value immediately.
    project = Project(id=uuid.uuid4(), key=body.key, name=body.name, description=body.description)
    # Single atomic transaction: project + creator owner membership (PLAN §5).
    # Project is flushed before the membership row — without relationship()
    # metadata the ORM does not order cross-mapper inserts by raw FKs.
    # On key collision the whole transaction rolls back — no orphan membership.
    try:
        session.add(project)
        await session.flush()
        session.add(ProjectMember(project_id=project.id, user_id=user.id, role="owner"))
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="project key already exists") from exc
    return ProjectRead.model_validate(project)


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    await require_member(session, project_id, user)
    project = (
        await session.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="not found")
    return ProjectRead.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    # Project settings (name/description/budget) are owner-only (404 non-member).
    await require_role(session, project_id, user, {"owner"})
    project = (await session.execute(select(Project).where(Project.id == project_id))).scalar_one()
    fields = body.model_dump(exclude_unset=True)
    for key, value in fields.items():
        setattr(project, key, value)
    await session.commit()
    # UPDATE's onupdate=now() leaves updated_at server-computed and expired;
    # refresh within the async context so sync serialization won't lazy-load.
    await session.refresh(project)
    return ProjectRead.model_validate(project)
