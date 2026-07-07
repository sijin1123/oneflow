import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import authorize, is_member, require_member, require_role
from app.db.session import get_session
from app.models.automation_rule import AutomationRule
from app.models.custom_field import CustomField
from app.models.member import ProjectMember
from app.models.project import Project
from app.models.project_status import DEFAULT_STATUSES, ProjectStatus
from app.models.project_type import DEFAULT_TYPES, ProjectType
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.project import (
    ProjectCreate,
    ProjectCreateResponse,
    ProjectList,
    ProjectListItem,
    ProjectRead,
    ProjectUpdate,
    TemplateApplied,
)

router = APIRouter()


def _member_project_ids(user: User):
    return select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)


@router.get("", response_model=ProjectList)
async def list_projects(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    include_archived: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectList:
    base = select(Project).where(Project.id.in_(_member_project_ids(user)))
    if not include_archived:
        base = base.where(Project.archived_at.is_(None))
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
    ids = [p.id for p in rows]
    wp_agg: dict = {}
    member_agg: dict = {}
    if ids:
        # Rollups share the visible scope by construction (project_id IN the
        # returned ids). utc_today binds from the API layer — never the DB
        # session timezone (v22.1 R1-②).
        utc_today = datetime.now(UTC).date()
        open_filter = WorkPackage.status.notin_(WP_CLOSED_STATUSES)
        wp_rows = (
            await session.execute(
                select(
                    WorkPackage.project_id,
                    func.count().label("total"),
                    func.count().filter(open_filter).label("open"),
                    func.count()
                    .filter(open_filter, WorkPackage.due_date < utc_today)
                    .label("overdue"),
                )
                .where(WorkPackage.project_id.in_(ids))
                .group_by(WorkPackage.project_id)
            )
        ).all()
        wp_agg = {pid: (t, o, ov) for pid, t, o, ov in wp_rows}
        member_rows = (
            await session.execute(
                select(ProjectMember.project_id, func.count())
                .where(ProjectMember.project_id.in_(ids))
                .group_by(ProjectMember.project_id)
            )
        ).all()
        member_agg = dict(member_rows)

    items = []
    for p in rows:
        item = ProjectListItem.model_validate(p)
        t, o, ov = wp_agg.get(p.id, (0, 0, 0))
        item.work_package_count = t
        item.open_work_package_count = o
        item.overdue_count = ov
        item.member_count = member_agg.get(p.id, 0)
        items.append(item)
    return ProjectList(items=items, total=total)


@router.post("", response_model=ProjectCreateResponse, status_code=201)
async def create_project(
    body: ProjectCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectCreateResponse:
    if not authorize(user, "project:create"):
        raise HTTPException(status_code=404, detail="not found")
    # Captured BEFORE any rollback: the template path resets the transaction,
    # which would expire `user` and turn user.id into a lazy load (MissingGreenlet).
    user_id = user.id
    if body.template_project_id is not None and not await is_member(
        session, body.template_project_id, user_id
    ):
        # Existence hiding: a template you cannot see does not exist for you.
        raise HTTPException(status_code=404, detail="not found")
    # id is assigned client-side up front — column defaults fire only at flush,
    # and the membership row below needs the FK value immediately.
    project = Project(id=uuid.uuid4(), key=body.key, name=body.name, description=body.description)
    # Single atomic transaction: project + creator owner membership (PLAN §5).
    # Project is flushed before the membership row — without relationship()
    # metadata the ORM does not order cross-mapper inserts by raw FKs.
    # On key collision the whole transaction rolls back — no orphan membership.
    applied: TemplateApplied | None = None
    try:
        if body.template_project_id is not None:
            # All template SELECTs must come from ONE snapshot, or a concurrent
            # template edit could copy a mixed state (v15.1 R1-② — PG default
            # READ COMMITTED snapshots per statement). SET TRANSACTION must be
            # the transaction's FIRST statement — the membership check above
            # already opened one, so reset it first (nothing written yet).
            await session.rollback()
            await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
        session.add(project)
        await session.flush()
        session.add(ProjectMember(project_id=project.id, user_id=user_id, role="owner"))
        if body.template_project_id is None:
            # Seed the default workflow (label + order per status key) so every
            # project has an editable status configuration from creation.
            session.add_all(
                ProjectStatus(project_id=project.id, key=key, name=name, position=pos)
                for key, name, pos in DEFAULT_STATUSES
            )
            # Same for work-item types (label/order/enablement — Pass 7 PR-R).
            session.add_all(
                ProjectType(project_id=project.id, key=key, name=name, position=pos)
                for key, name, pos in DEFAULT_TYPES
            )
        else:
            # Template mode SKIPS the default seeds (v15.1 R1-③): the fixed KEY
            # vocabulary makes the template rows the same set, just with the
            # template's labels/order/enablement. SETTINGS only — no content.
            applied = await _copy_template_settings(
                session, source=body.template_project_id, target=project.id
            )
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="project key already exists") from exc
    response = ProjectCreateResponse.model_validate(project)
    response.template_applied = applied
    return response


async def _copy_template_settings(
    session: AsyncSession, *, source: uuid.UUID, target: uuid.UUID
) -> TemplateApplied:
    """Copy SETTINGS from the template project inside the caller's transaction.
    Members can already read every copied kind (automation rules included —
    v15.1 R1-①), so this leaks nothing. Copied automation rules start DISABLED
    (R1-④ — review before they act) with fresh fire counters."""
    statuses = (
        (await session.execute(select(ProjectStatus).where(ProjectStatus.project_id == source)))
        .scalars()
        .all()
    )
    session.add_all(
        ProjectStatus(project_id=target, key=s.key, name=s.name, position=s.position)
        for s in statuses
    )
    types = (
        (await session.execute(select(ProjectType).where(ProjectType.project_id == source)))
        .scalars()
        .all()
    )
    session.add_all(
        ProjectType(
            project_id=target, key=t.key, name=t.name, position=t.position, is_active=t.is_active
        )
        for t in types
    )
    fields = (
        (await session.execute(select(CustomField).where(CustomField.project_id == source)))
        .scalars()
        .all()
    )
    session.add_all(
        CustomField(
            project_id=target,
            name=f.name,
            field_type=f.field_type,
            options=f.options,
            position=f.position,
            applies_to=f.applies_to,
            is_active=f.is_active,
        )
        for f in fields
    )
    rules = (
        (await session.execute(select(AutomationRule).where(AutomationRule.project_id == source)))
        .scalars()
        .all()
    )
    session.add_all(
        AutomationRule(
            project_id=target,
            name=r.name,
            trigger_type=r.trigger_type,
            trigger_value=r.trigger_value,
            action_type=r.action_type,
            action_value=r.action_value,
            is_active=False,  # safe default — review, then enable (R1-④)
        )
        for r in rules
    )
    return TemplateApplied(
        statuses=len(statuses),
        types=len(types),
        custom_fields=len(fields),
        automation_rules=len(rules),
    )


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
    await require_role(session, project_id, user, {"owner"}, write=True)
    project = (await session.execute(select(Project).where(Project.id == project_id))).scalar_one()
    fields = body.model_dump(exclude_unset=True)
    # `name` is NOT NULL: an explicit null is a client error (422), never an
    # unhandled IntegrityError → 500 (fable5 audit: PATCH null-semantics).
    if "name" in fields and fields["name"] is None:
        raise HTTPException(status_code=422, detail="name cannot be null")
    for key, value in fields.items():
        setattr(project, key, value)
    await session.commit()
    # UPDATE's onupdate=now() leaves updated_at server-computed and expired;
    # refresh within the async context so sync serialization won't lazy-load.
    await session.refresh(project)
    return ProjectRead.model_validate(project)


@router.post("/{project_id}/archive", response_model=ProjectRead)
async def archive_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    """Owner-only, idempotent. An archived project becomes read-only: every
    project-scoped write returns 409 until the owner restores it (PR-G).
    Deliberately NOT write-gated — archiving twice is a no-op, not an error."""
    await require_role(session, project_id, user, {"owner"})
    project = (await session.execute(select(Project).where(Project.id == project_id))).scalar_one()
    if project.archived_at is None:
        project.archived_at = func.now()
        await session.commit()
        await session.refresh(project)
    return ProjectRead.model_validate(project)


@router.post("/{project_id}/unarchive", response_model=ProjectRead)
async def unarchive_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRead:
    """Owner-only, idempotent restore — the one write an archived project accepts."""
    await require_role(session, project_id, user, {"owner"})
    project = (await session.execute(select(Project).where(Project.id == project_id))).scalar_one()
    if project.archived_at is not None:
        project.archived_at = None
        await session.commit()
        await session.refresh(project)
    return ProjectRead.model_validate(project)
