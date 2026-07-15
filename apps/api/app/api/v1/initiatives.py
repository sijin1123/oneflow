import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member
from app.db.session import get_session
from app.models.initiative import Initiative, InitiativeProject, InitiativeWorkPackage
from app.models.member import ProjectMember
from app.models.project import Project
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.initiative import (
    InitiativeConnect,
    InitiativeCreate,
    InitiativeList,
    InitiativeOwnerCandidateList,
    InitiativeOwnerCandidateRead,
    InitiativeOwnerTransfer,
    InitiativeProjectRead,
    InitiativeRead,
    InitiativeUpdate,
    InitiativeWorkItemCandidateList,
    InitiativeWorkItemConnect,
    InitiativeWorkItemList,
    InitiativeWorkItemRead,
)
from app.services.health import apply_health_patch
from app.services.workspace_features import INITIATIVES_FEATURE, feature_enabled


async def _require_initiatives_enabled(
    session: AsyncSession = Depends(get_session),
) -> None:
    if not await feature_enabled(session, INITIATIVES_FEATURE):
        raise HTTPException(status_code=404, detail="not found")


router = APIRouter(dependencies=[Depends(_require_initiatives_enabled)])

# Visibility contract (PLAN P3-3 → PR-L): an initiative is visible if you
# created it OR you are a member of at least one connected project. Roll-ups
# only aggregate projects the CALLER is a member of, so a connection to a
# project you cannot see never leaks its contents — only its existence via
# connected_project_count. Edits/connections are creator-only.


def _membership(user: User):
    return select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)


async def _visible_initiative(
    session: AsyncSession, initiative_id: uuid.UUID, user: User
) -> Initiative:
    ini = (
        await session.execute(select(Initiative).where(Initiative.id == initiative_id))
    ).scalar_one_or_none()
    if ini is None:
        raise HTTPException(status_code=404, detail="not found")
    if ini.owner_id == user.id:
        return ini
    connected_visible = (
        await session.execute(
            select(func.count())
            .select_from(InitiativeProject)
            .where(
                InitiativeProject.initiative_id == initiative_id,
                InitiativeProject.project_id.in_(_membership(user)),
            )
        )
    ).scalar_one()
    if connected_visible == 0:
        raise HTTPException(status_code=404, detail="not found")
    return ini


async def _require_creator(
    session: AsyncSession, initiative_id: uuid.UUID, user: User
) -> Initiative:
    # Creator-only mutations; everyone else gets 404 (existence hiding is
    # already partial via visibility, keep the mutation surface consistent).
    ini = await _visible_initiative(session, initiative_id, user)
    if ini.owner_id != user.id:
        raise HTTPException(status_code=404, detail="not found")
    return ini


async def _require_creator_locked(
    session: AsyncSession, initiative_id: uuid.UUID, user: User
) -> Initiative:
    ini = (
        await session.execute(
            select(Initiative).where(Initiative.id == initiative_id).with_for_update()
        )
    ).scalar_one_or_none()
    if ini is None or ini.owner_id != user.id:
        raise HTTPException(status_code=404, detail="not found")
    return ini


async def _claimable_by(session: AsyncSession, initiative_id: uuid.UUID, user: User) -> bool:
    return (
        await session.execute(
            select(func.count())
            .select_from(ProjectMember)
            .join(
                InitiativeProject,
                InitiativeProject.project_id == ProjectMember.project_id,
            )
            .where(
                InitiativeProject.initiative_id == initiative_id,
                ProjectMember.user_id == user.id,
                ProjectMember.role == "owner",
            )
        )
    ).scalar_one() > 0


async def _owner_candidates(
    session: AsyncSession, initiative_id: uuid.UUID, user: User
) -> list[InitiativeOwnerCandidateRead]:
    visible_connected_projects = select(InitiativeProject.project_id).where(
        InitiativeProject.initiative_id == initiative_id,
        InitiativeProject.project_id.in_(_membership(user)),
    )
    rows = (
        await session.execute(
            select(User.id, User.display_name)
            .join(ProjectMember, ProjectMember.user_id == User.id)
            .where(
                User.is_active.is_(True),
                User.id != user.id,
                ProjectMember.project_id.in_(visible_connected_projects),
            )
            .distinct()
            .order_by(User.display_name.asc(), User.id.asc())
        )
    ).all()
    return [
        InitiativeOwnerCandidateRead(user_id=user_id, display_name=display_name)
        for user_id, display_name in rows
    ]


async def _lock_eligible_owner_candidate(
    session: AsyncSession,
    initiative_id: uuid.UUID,
    current_owner: User,
    candidate_id: uuid.UUID,
) -> bool:
    candidate = (
        await session.execute(
            select(User.id)
            .where(User.id == candidate_id, User.is_active.is_(True))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if candidate is None or candidate == current_owner.id:
        return False
    membership = (
        await session.execute(
            select(ProjectMember.id)
            .join(
                InitiativeProject,
                InitiativeProject.project_id == ProjectMember.project_id,
            )
            .where(
                InitiativeProject.initiative_id == initiative_id,
                ProjectMember.user_id == candidate_id,
                ProjectMember.project_id.in_(_membership(current_owner)),
            )
            .with_for_update(of=ProjectMember)
            .limit(1)
        )
    ).scalar_one_or_none()
    return membership is not None


async def _lock_claimable_membership(
    session: AsyncSession, initiative_id: uuid.UUID, user: User
) -> bool:
    membership = (
        await session.execute(
            select(ProjectMember.id)
            .join(
                InitiativeProject,
                InitiativeProject.project_id == ProjectMember.project_id,
            )
            .where(
                InitiativeProject.initiative_id == initiative_id,
                ProjectMember.user_id == user.id,
                ProjectMember.role == "owner",
            )
            .with_for_update(of=ProjectMember)
            .limit(1)
        )
    ).scalar_one_or_none()
    return membership is not None


def _work_item_read(wp: WorkPackage, project_name: str) -> InitiativeWorkItemRead:
    return InitiativeWorkItemRead(
        id=wp.id,
        project_id=wp.project_id,
        project_name=project_name,
        subject=wp.subject,
        status=wp.status,
        priority=wp.priority,
        assignee_id=wp.assignee_id,
        due_date=wp.due_date,
    )


async def _read_one(session: AsyncSession, ini: Initiative, user: User) -> InitiativeRead:
    total_connected = (
        await session.execute(
            select(func.count())
            .select_from(InitiativeProject)
            .where(InitiativeProject.initiative_id == ini.id)
        )
    ).scalar_one()
    total_connected_work_items = (
        await session.execute(
            select(func.count())
            .select_from(InitiativeWorkPackage)
            .where(InitiativeWorkPackage.initiative_id == ini.id)
        )
    ).scalar_one()
    done = func.count().filter(WorkPackage.status.in_(WP_CLOSED_STATUSES))
    rows = (
        await session.execute(
            select(Project.id, Project.name, func.count(WorkPackage.id), done)
            .join(InitiativeProject, InitiativeProject.project_id == Project.id)
            .outerjoin(WorkPackage, WorkPackage.project_id == Project.id)
            .where(
                InitiativeProject.initiative_id == ini.id,
                Project.id.in_(_membership(user)),
            )
            .group_by(Project.id, Project.name)
            .order_by(Project.name)
        )
    ).all()
    owner_name = None
    owner_active = False
    if ini.owner_id is not None:
        owner = (
            await session.execute(
                select(User.display_name, User.is_active).where(User.id == ini.owner_id)
            )
        ).one_or_none()
        if owner is not None:
            owner_name, owner_active = owner
    can_claim_ownership = False
    if not owner_active:
        can_claim_ownership = await _claimable_by(session, ini.id, user)
    return InitiativeRead(
        id=ini.id,
        name=ini.name,
        description=ini.description,
        owner_id=ini.owner_id,
        owner_name=owner_name,
        owner_active=owner_active,
        state=ini.state,
        start_date=ini.start_date,
        target_date=ini.target_date,
        health=ini.health,
        health_note=ini.health_note,
        health_updated_by=ini.health_updated_by,
        health_updated_at=ini.health_updated_at,
        is_mine=ini.owner_id == user.id,
        can_claim_ownership=can_claim_ownership,
        connected_project_count=total_connected,
        connected_work_item_count=total_connected_work_items,
        projects=[
            InitiativeProjectRead(
                project_id=pid,
                project_name=name,
                work_package_count=wp_count,
                done_work_package_count=done_count,
            )
            for (pid, name, wp_count, done_count) in rows
        ],
        created_at=ini.created_at,
        updated_at=ini.updated_at,
    )


@router.get("/initiatives", response_model=InitiativeList)
async def list_initiatives(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeList:
    visible_ids = select(InitiativeProject.initiative_id).where(
        InitiativeProject.project_id.in_(_membership(user))
    )
    rows = (
        (
            await session.execute(
                select(Initiative)
                .where(or_(Initiative.owner_id == user.id, Initiative.id.in_(visible_ids)))
                .order_by(Initiative.created_at.desc(), Initiative.id.desc())
            )
        )
        .scalars()
        .all()
    )
    items = [await _read_one(session, ini, user) for ini in rows]
    return InitiativeList(items=items, total=len(items))


@router.post("/initiatives", response_model=InitiativeRead, status_code=201)
async def create_initiative(
    body: InitiativeCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeRead:
    if body.start_date and body.target_date and body.start_date > body.target_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before target_date")
    ini = Initiative(
        name=body.name,
        description=body.description,
        owner_id=user.id,
        state=body.state,
        start_date=body.start_date,
        target_date=body.target_date,
    )
    session.add(ini)
    await session.commit()
    return await _read_one(session, ini, user)


@router.get(
    "/initiatives/{initiative_id}/owner-candidates",
    response_model=InitiativeOwnerCandidateList,
)
async def list_owner_candidates(
    initiative_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeOwnerCandidateList:
    await _require_creator(session, initiative_id, user)
    items = await _owner_candidates(session, initiative_id, user)
    return InitiativeOwnerCandidateList(items=items, total=len(items))


@router.post("/initiatives/{initiative_id}/owner", response_model=InitiativeRead)
async def transfer_ownership(
    initiative_id: uuid.UUID,
    body: InitiativeOwnerTransfer,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeRead:
    ini = (
        await session.execute(
            select(Initiative).where(Initiative.id == initiative_id).with_for_update()
        )
    ).scalar_one_or_none()
    if ini is None or ini.owner_id != user.id:
        raise HTTPException(status_code=404, detail="not found")
    if not await _lock_eligible_owner_candidate(session, initiative_id, user, body.owner_id):
        raise HTTPException(status_code=422, detail="owner is not an eligible active member")
    ini.owner_id = body.owner_id
    await session.commit()
    await session.refresh(ini)
    return await _read_one(session, ini, user)


@router.post("/initiatives/{initiative_id}/owner/claim", response_model=InitiativeRead)
async def claim_ownership(
    initiative_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeRead:
    ini = (
        await session.execute(
            select(Initiative).where(Initiative.id == initiative_id).with_for_update()
        )
    ).scalar_one_or_none()
    if ini is None or not await _lock_claimable_membership(session, initiative_id, user):
        raise HTTPException(status_code=404, detail="not found")
    owner_active = False
    if ini.owner_id is not None:
        owner_active = (
            await session.execute(
                select(User.is_active).where(User.id == ini.owner_id).with_for_update()
            )
        ).scalar_one_or_none() is True
    if owner_active:
        raise HTTPException(status_code=409, detail="initiative already has an active owner")
    ini.owner_id = user.id
    await session.commit()
    await session.refresh(ini)
    return await _read_one(session, ini, user)


@router.get(
    "/initiatives/{initiative_id}/work-items",
    response_model=InitiativeWorkItemList,
)
async def list_initiative_work_items(
    initiative_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeWorkItemList:
    await _visible_initiative(session, initiative_id, user)
    visible = (
        select(WorkPackage, Project.name)
        .join(
            InitiativeWorkPackage,
            InitiativeWorkPackage.work_package_id == WorkPackage.id,
        )
        .join(Project, Project.id == WorkPackage.project_id)
        .where(
            InitiativeWorkPackage.initiative_id == initiative_id,
            WorkPackage.project_id.in_(_membership(user)),
        )
    )
    total = (
        await session.execute(select(func.count()).select_from(visible.subquery()))
    ).scalar_one()
    connected_work_item_count = (
        await session.execute(
            select(func.count())
            .select_from(InitiativeWorkPackage)
            .where(InitiativeWorkPackage.initiative_id == initiative_id)
        )
    ).scalar_one()
    rows = (
        await session.execute(
            visible.order_by(
                Project.name.asc(),
                WorkPackage.subject.collate("oneflow_korean").asc(),
                WorkPackage.id.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return InitiativeWorkItemList(
        items=[_work_item_read(wp, project_name) for wp, project_name in rows],
        total=total,
        connected_work_item_count=connected_work_item_count,
    )


@router.get(
    "/initiatives/{initiative_id}/work-item-candidates",
    response_model=InitiativeWorkItemCandidateList,
)
async def list_initiative_work_item_candidates(
    initiative_id: uuid.UUID,
    q: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=30, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeWorkItemCandidateList:
    await _require_creator(session, initiative_id, user)
    linked_ids = select(InitiativeWorkPackage.work_package_id).where(
        InitiativeWorkPackage.initiative_id == initiative_id
    )
    candidates = (
        select(WorkPackage, Project.name)
        .join(Project, Project.id == WorkPackage.project_id)
        .join(
            InitiativeProject,
            and_(
                InitiativeProject.initiative_id == initiative_id,
                InitiativeProject.project_id == WorkPackage.project_id,
            ),
        )
        .where(
            WorkPackage.project_id.in_(_membership(user)),
            WorkPackage.id.not_in(linked_ids),
        )
    )
    if q:
        candidates = candidates.where(WorkPackage.subject.icontains(q, autoescape=True))
    total = (
        await session.execute(select(func.count()).select_from(candidates.subquery()))
    ).scalar_one()
    rows = (
        await session.execute(
            candidates.order_by(
                Project.name.asc(),
                WorkPackage.subject.collate("oneflow_korean").asc(),
                WorkPackage.id.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return InitiativeWorkItemCandidateList(
        items=[_work_item_read(wp, project_name) for wp, project_name in rows],
        total=total,
    )


@router.post(
    "/initiatives/{initiative_id}/work-items",
    response_model=InitiativeWorkItemRead,
    status_code=201,
)
async def connect_initiative_work_item(
    initiative_id: uuid.UUID,
    body: InitiativeWorkItemConnect,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeWorkItemRead:
    await _require_creator_locked(session, initiative_id, user)
    row = (
        await session.execute(
            select(WorkPackage, Project.name)
            .join(Project, Project.id == WorkPackage.project_id)
            .join(
                InitiativeProject,
                and_(
                    InitiativeProject.initiative_id == initiative_id,
                    InitiativeProject.project_id == WorkPackage.project_id,
                ),
            )
            .where(
                WorkPackage.id == body.work_package_id,
                WorkPackage.project_id.in_(_membership(user)),
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    wp, project_name = row
    try:
        session.add(
            InitiativeWorkPackage(
                initiative_id=initiative_id,
                project_id=wp.project_id,
                work_package_id=wp.id,
            )
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="work item already connected or no longer eligible",
        ) from exc
    return _work_item_read(wp, project_name)


@router.delete(
    "/initiatives/{initiative_id}/work-items/{work_package_id}",
    status_code=204,
)
async def disconnect_initiative_work_item(
    initiative_id: uuid.UUID,
    work_package_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await _require_creator_locked(session, initiative_id, user)
    link = (
        await session.execute(
            select(InitiativeWorkPackage).where(
                InitiativeWorkPackage.initiative_id == initiative_id,
                InitiativeWorkPackage.work_package_id == work_package_id,
                InitiativeWorkPackage.project_id.in_(_membership(user)),
            )
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="not found")
    await session.delete(link)
    await session.commit()
    return Response(status_code=204)


@router.patch("/initiatives/{initiative_id}", response_model=InitiativeRead)
async def update_initiative(
    initiative_id: uuid.UUID,
    body: InitiativeUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeRead:
    ini = await _require_creator(session, initiative_id, user)
    fields = body.model_dump(exclude_unset=True)
    for key in ("name", "state"):
        if key in fields and fields[key] is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
    start = fields.get("start_date", ini.start_date)
    target = fields.get("target_date", ini.target_date)
    if start and target and start > target:
        raise HTTPException(status_code=422, detail="start_date must be on or before target_date")
    # Health report (Pass 44): creator-only like every initiative edit; the
    # shared pure helper owns ONLY the payload transition (v44.1 R1-③).
    apply_health_patch(ini, fields, user.id)
    for key, value in fields.items():
        setattr(ini, key, value)
    await session.commit()
    await session.refresh(ini)  # onupdate updated_at is server-computed
    return await _read_one(session, ini, user)


@router.delete("/initiatives/{initiative_id}", status_code=204)
async def delete_initiative(
    initiative_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    ini = await _require_creator(session, initiative_id, user)
    await session.delete(ini)  # connections CASCADE; projects untouched
    await session.commit()
    return Response(status_code=204)


@router.post("/initiatives/{initiative_id}/projects", response_model=InitiativeRead)
async def connect_project(
    initiative_id: uuid.UUID,
    body: InitiativeConnect,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeRead:
    ini = await _require_creator(session, initiative_id, user)
    # The creator may only connect projects THEY can see (404 keeps existence
    # hidden, consistent with every other membership guard).
    await require_member(session, body.project_id, user)
    try:
        session.add(InitiativeProject(initiative_id=ini.id, project_id=body.project_id))
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="project already connected") from exc
    return await _read_one(session, ini, user)


@router.delete("/initiatives/{initiative_id}/projects/{project_id}", response_model=InitiativeRead)
async def disconnect_project(
    initiative_id: uuid.UUID,
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> InitiativeRead:
    ini = await _require_creator(session, initiative_id, user)
    result = await session.execute(
        InitiativeProject.__table__.delete().where(
            InitiativeProject.initiative_id == initiative_id,
            InitiativeProject.project_id == project_id,
        )
    )
    await session.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="not found")
    return await _read_one(session, ini, user)
