import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_role
from app.db.session import get_session
from app.models.project import Project
from app.models.project_publication import ProjectPublication, ProjectPublicationEvent
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.project_publication import ProjectPublicationRead, PublicProjectRead

router = APIRouter()


def _status(publication: ProjectPublication | None) -> ProjectPublicationRead:
    active = publication is not None and publication.revoked_at is None
    return ProjectPublicationRead(
        published=active,
        public_id=publication.public_id if active else None,
        published_at=publication.published_at if active else None,
        revoked_at=publication.revoked_at if publication is not None else None,
        revision=publication.revision if publication is not None else 0,
    )


@router.get(
    "/projects/{project_id}/publication",
    response_model=ProjectPublicationRead,
)
async def get_project_publication(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectPublicationRead:
    await require_role(session, project_id, user, {"owner"})
    publication = await session.get(ProjectPublication, project_id)
    return _status(publication)


@router.post(
    "/projects/{project_id}/publication",
    response_model=ProjectPublicationRead,
)
async def publish_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectPublicationRead:
    await require_role(session, project_id, user, {"owner"}, write=True)
    project = (
        await session.execute(select(Project).where(Project.id == project_id).with_for_update())
    ).scalar_one()
    if project.archived_at is not None:
        raise HTTPException(status_code=409, detail="project is archived")

    publication = (
        await session.execute(
            select(ProjectPublication)
            .where(ProjectPublication.project_id == project_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if publication is not None and publication.revoked_at is None:
        return _status(publication)

    now = (await session.execute(select(func.now()))).scalar_one()
    public_id = uuid.uuid4()
    if publication is None:
        publication = ProjectPublication(
            project_id=project_id,
            public_id=public_id,
            revision=1,
            published_by=user.id,
            published_at=now,
        )
        session.add(publication)
        await session.flush()
    else:
        publication.public_id = public_id
        publication.revision += 1
        publication.published_by = user.id
        publication.published_at = now
        publication.revoked_by = None
        publication.revoked_at = None
    session.add(
        ProjectPublicationEvent(
            project_id=project_id,
            public_id=public_id,
            actor_id=user.id,
            event_type="published",
            revision=publication.revision,
        )
    )
    await session.commit()
    return _status(publication)


@router.delete(
    "/projects/{project_id}/publication",
    response_model=ProjectPublicationRead,
)
async def revoke_project_publication(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectPublicationRead:
    await require_role(session, project_id, user, {"owner"})
    await session.execute(select(Project.id).where(Project.id == project_id).with_for_update())
    publication = (
        await session.execute(
            select(ProjectPublication)
            .where(ProjectPublication.project_id == project_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if publication is None or publication.revoked_at is not None:
        return _status(publication)

    now = (await session.execute(select(func.now()))).scalar_one()
    publication.revoked_by = user.id
    publication.revoked_at = now
    session.add(
        ProjectPublicationEvent(
            project_id=project_id,
            public_id=publication.public_id,
            actor_id=user.id,
            event_type="revoked",
            revision=publication.revision,
        )
    )
    await session.commit()
    return _status(publication)


@router.get(
    "/public/projects/{public_id}",
    response_model=PublicProjectRead,
)
async def get_public_project(
    public_id: uuid.UUID,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> PublicProjectRead:
    response.headers["Cache-Control"] = "no-store"
    row = (
        await session.execute(
            select(ProjectPublication, Project)
            .join(Project, Project.id == ProjectPublication.project_id)
            .where(
                ProjectPublication.public_id == public_id,
                ProjectPublication.revoked_at.is_(None),
                Project.archived_at.is_(None),
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="not found",
            headers={"Cache-Control": "no-store"},
        )
    publication, project = row
    total, completed = (
        await session.execute(
            select(
                func.count(),
                func.count().filter(WorkPackage.status.in_(WP_CLOSED_STATUSES)),
            ).where(WorkPackage.project_id == project.id)
        )
    ).one()
    total = int(total)
    completed = int(completed)
    return PublicProjectRead(
        public_id=publication.public_id,
        name=project.name,
        description=project.description,
        published_at=publication.published_at,
        work_package_count=total,
        open_work_package_count=total - completed,
        completed_work_package_count=completed,
        completion_percent=round(completed * 100 / total) if total else 0,
    )
