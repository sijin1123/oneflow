"""Versioned project-settings template catalog."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import authorize, require_role
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.project import Project
from app.models.project_template import (
    ProjectTemplate,
    ProjectTemplateApplication,
    ProjectTemplateEvent,
    ProjectTemplateRevision,
)
from app.models.user import User
from app.schemas.project import ProjectCreateResponse
from app.schemas.project import TemplateApplied as ProjectTemplateApplied
from app.schemas.project_template import (
    ProjectTemplateApply,
    ProjectTemplateCreate,
    ProjectTemplateList,
    ProjectTemplateRead,
    ProjectTemplateRevisionCreate,
    ProjectTemplateSourceList,
    ProjectTemplateSourceRead,
    ProjectTemplateSummary,
)
from app.services.project_templates import (
    capture_project_settings,
    create_template_revision,
    materialize_project_settings,
)

router = APIRouter()


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="not found")


async def _template(session: AsyncSession, template_id: uuid.UUID) -> ProjectTemplate:
    template = await session.get(ProjectTemplate, template_id)
    if template is None or template.deleted_at is not None:
        raise _not_found()
    return template


def _can_manage(template: ProjectTemplate, user: User) -> bool:
    return template.created_by == user.id or (user.is_active and user.is_admin)


async def _manageable_template(
    session: AsyncSession, template_id: uuid.UUID, user: User
) -> ProjectTemplate:
    template = await _template(session, template_id)
    if not _can_manage(template, user):
        raise _not_found()
    return template


async def _locked_manageable_template(
    session: AsyncSession, template_id: uuid.UUID, user: User
) -> ProjectTemplate:
    template = (
        await session.execute(
            select(ProjectTemplate)
            .where(
                ProjectTemplate.id == template_id,
                ProjectTemplate.deleted_at.is_(None),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if template is None or not _can_manage(template, user):
        raise _not_found()
    return template


async def _source_owner(session: AsyncSession, source_id: uuid.UUID, user: User) -> Project:
    await require_role(session, source_id, user, {"owner"}, write=True)
    source = await session.get(Project, source_id)
    if source is None:
        raise _not_found()
    return source


async def _restart_repeatable(session: AsyncSession, user_id: uuid.UUID) -> User:
    """Restart after preflight so every settings table is captured from one snapshot."""
    await session.rollback()
    await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise _not_found()
    return user


def _summary(revision: ProjectTemplateRevision | None) -> ProjectTemplateSummary | None:
    if revision is None:
        return None
    snapshot = revision.snapshot
    return ProjectTemplateSummary(
        version=revision.version,
        statuses=len(snapshot.get("statuses", [])),
        types=len(snapshot.get("types", [])),
        custom_fields=len(snapshot.get("custom_fields", [])),
        automation_rules=len(snapshot.get("automation_rules", [])),
    )


async def _catalog_rows(
    session: AsyncSession, templates: list[ProjectTemplate], user: User
) -> list[ProjectTemplateRead]:
    ids = [template.id for template in templates]
    source_names: dict[uuid.UUID, str] = {}
    creator_names: dict[uuid.UUID, str] = {}
    revisions: dict[uuid.UUID, ProjectTemplateRevision] = {}
    if ids:
        source_ids = [
            template.source_project_id for template in templates if template.source_project_id
        ]
        source_rows = await session.execute(
            select(Project.id, Project.name).where(Project.id.in_(source_ids))
        )
        source_names = dict(source_rows.all())
        creator_rows = await session.execute(
            select(User.id, User.display_name).where(
                User.id.in_([template.created_by for template in templates if template.created_by])
            )
        )
        creator_names = dict(creator_rows.all())
        for revision in (
            await session.execute(
                select(ProjectTemplateRevision)
                .where(ProjectTemplateRevision.template_id.in_(ids))
                .distinct(ProjectTemplateRevision.template_id)
                .order_by(
                    ProjectTemplateRevision.template_id,
                    ProjectTemplateRevision.version.desc(),
                )
            )
        ).scalars():
            revisions.setdefault(revision.template_id, revision)
    return [
        ProjectTemplateRead(
            id=template.id,
            name=template.name,
            description=template.description,
            source_project_id=template.source_project_id,
            source_project_name=source_names.get(template.source_project_id),
            created_by=template.created_by,
            creator_name=creator_names.get(template.created_by),
            archived_at=template.archived_at,
            created_at=template.created_at,
            updated_at=template.updated_at,
            latest_revision=_summary(revisions.get(template.id)),
            can_manage=_can_manage(template, user),
        )
        for template in templates
    ]


@router.get("", response_model=ProjectTemplateList)
async def list_project_templates(
    q: str | None = Query(default=None, min_length=1, max_length=120),
    include_archived: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTemplateList:
    base = select(ProjectTemplate).where(ProjectTemplate.deleted_at.is_(None))
    if not include_archived:
        base = base.where(ProjectTemplate.archived_at.is_(None))
    if q:
        base = base.where(ProjectTemplate.name.icontains(q.strip(), autoescape=True))
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    templates = (
        (
            await session.execute(
                base.order_by(ProjectTemplate.updated_at.desc(), ProjectTemplate.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return ProjectTemplateList(
        items=await _catalog_rows(session, templates, user),
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ProjectTemplateRead, status_code=201)
async def create_project_template(
    body: ProjectTemplateCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTemplateRead:
    user_id = user.id
    await _source_owner(session, body.source_project_id, user)
    user = await _restart_repeatable(session, user_id)
    source = await _source_owner(session, body.source_project_id, user)
    try:
        snapshot = await capture_project_settings(session, source.id)
        template = ProjectTemplate(
            id=uuid.uuid4(),
            name=body.name,
            description=body.description,
            source_project_id=source.id,
            created_by=user_id,
        )
        session.add(template)
        await session.flush()
        revision = await create_template_revision(
            session, template.id, snapshot, created_by=user_id
        )
        session.add(
            ProjectTemplateEvent(
                template_id=template.id,
                revision_id=revision.id,
                actor_id=user_id,
                event_type="created",
            )
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="project template name already exists") from exc
    return (await _catalog_rows(session, [template], user))[0]


@router.get("/sources", response_model=ProjectTemplateSourceList)
async def list_project_template_sources(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTemplateSourceList:
    rows = (
        (
            await session.execute(
                select(Project)
                .join(ProjectMember, ProjectMember.project_id == Project.id)
                .where(
                    ProjectMember.user_id == user.id,
                    ProjectMember.role == "owner",
                    Project.archived_at.is_(None),
                )
                .order_by(Project.name.asc(), Project.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return ProjectTemplateSourceList(
        items=[ProjectTemplateSourceRead(id=row.id, key=row.key, name=row.name) for row in rows],
        total=len(rows),
    )


@router.post("/{template_id}/revisions", response_model=ProjectTemplateRead, status_code=201)
async def create_project_template_revision(
    template_id: uuid.UUID,
    body: ProjectTemplateRevisionCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTemplateRead:
    template = await _locked_manageable_template(session, template_id, user)
    if template.archived_at is not None:
        raise HTTPException(status_code=409, detail="project template is archived")
    source_id = body.source_project_id or template.source_project_id
    if source_id is None:
        raise _not_found()
    user_id = user.id
    await _source_owner(session, source_id, user)
    user = await _restart_repeatable(session, user_id)
    locked_template = (
        await session.execute(
            select(ProjectTemplate).where(ProjectTemplate.id == template_id).with_for_update()
        )
    ).scalar_one_or_none()
    if locked_template is None or locked_template.deleted_at is not None:
        raise _not_found()
    if locked_template.archived_at is not None:
        raise HTTPException(status_code=409, detail="project template is archived")
    if not _can_manage(locked_template, user):
        raise _not_found()
    source = await _source_owner(session, source_id, user)
    snapshot = await capture_project_settings(session, source.id)
    try:
        revision = await create_template_revision(
            session, locked_template.id, snapshot, created_by=user_id
        )
        session.add(
            ProjectTemplateEvent(
                template_id=locked_template.id,
                revision_id=revision.id,
                actor_id=user_id,
                event_type="revision_created",
            )
        )
        locked_template.source_project_id = source.id
        locked_template.updated_at = datetime.now(UTC)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="project template revision conflict") from exc
    await session.refresh(locked_template)
    return (await _catalog_rows(session, [locked_template], user))[0]


async def _set_archive(
    template_id: uuid.UUID, archived: bool, session: AsyncSession, user: User
) -> ProjectTemplateRead:
    template = await _locked_manageable_template(session, template_id, user)
    changed = False
    if archived and template.archived_at is None:
        template.archived_at = datetime.now(UTC)
        changed = True
    elif not archived and template.archived_at is not None:
        template.archived_at = None
        changed = True
    if changed:
        session.add(
            ProjectTemplateEvent(
                template_id=template.id,
                actor_id=user.id,
                event_type="archived" if archived else "unarchived",
            )
        )
    await session.commit()
    await session.refresh(template)
    return (await _catalog_rows(session, [template], user))[0]


@router.post("/{template_id}/archive", response_model=ProjectTemplateRead)
async def archive_project_template(
    template_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTemplateRead:
    return await _set_archive(template_id, True, session, user)


@router.post("/{template_id}/unarchive", response_model=ProjectTemplateRead)
async def unarchive_project_template(
    template_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectTemplateRead:
    return await _set_archive(template_id, False, session, user)


@router.delete("/{template_id}", status_code=204)
async def delete_project_template(
    template_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    template = await _locked_manageable_template(session, template_id, user)
    if template.archived_at is None:
        raise HTTPException(
            status_code=409, detail="project template must be archived before deletion"
        )
    template.deleted_at = datetime.now(UTC)
    session.add(
        ProjectTemplateEvent(
            template_id=template.id,
            actor_id=user.id,
            event_type="deleted",
        )
    )
    await session.commit()
    return Response(status_code=204)


@router.post("/{template_id}/apply", response_model=ProjectCreateResponse, status_code=201)
async def apply_project_template(
    template_id: uuid.UUID,
    body: ProjectTemplateApply,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectCreateResponse:
    if not authorize(user, "project:create"):
        raise _not_found()
    template = (
        await session.execute(
            select(ProjectTemplate)
            .where(ProjectTemplate.id == template_id, ProjectTemplate.deleted_at.is_(None))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if template is None:
        raise _not_found()
    if template.archived_at is not None:
        raise HTTPException(status_code=409, detail="project template is archived")
    revision = (
        await session.execute(
            select(ProjectTemplateRevision)
            .where(ProjectTemplateRevision.template_id == template.id)
            .order_by(ProjectTemplateRevision.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if revision is None:
        raise HTTPException(status_code=409, detail="project template has no revision")
    user_id = user.id
    project = Project(id=uuid.uuid4(), key=body.key, name=body.name, description=body.description)
    try:
        session.add(project)
        await session.flush()
        session.add(ProjectMember(project_id=project.id, user_id=user_id, role="owner"))
        applied = await materialize_project_settings(session, project.id, revision.snapshot)
        session.add(
            ProjectTemplateApplication(
                template_id=template.id,
                revision_id=revision.id,
                project_id=project.id,
                applied_by=user_id,
            )
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="project key already exists") from exc
    response = ProjectCreateResponse.model_validate(project)
    response.template_applied = ProjectTemplateApplied(**applied.model_dump())
    return response
