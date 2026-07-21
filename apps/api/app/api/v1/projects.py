import uuid

from anyio import CapacityLimiter, to_thread
from fastapi import APIRouter, Depends, HTTPException, Query
from PIL import Image, ImageSequence, UnidentifiedImageError
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import authorize, is_member, require_member, require_role
from app.core.config import Settings, get_settings
from app.core.dates import utc_today
from app.db.session import get_session
from app.models.attachment import Attachment
from app.models.initiative import Initiative, InitiativeProject
from app.models.member import ProjectMember
from app.models.project import Project
from app.models.project_health_history import ProjectHealthHistory
from app.models.project_publication import ProjectPublication, ProjectPublicationEvent
from app.models.project_status import DEFAULT_STATUSES, ProjectStatus
from app.models.project_type import DEFAULT_TYPES, ProjectType
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.project import (
    ProjectCreate,
    ProjectCreateResponse,
    ProjectHealthHistoryList,
    ProjectHealthHistoryRead,
    ProjectInitiativeRef,
    ProjectList,
    ProjectListItem,
    ProjectRead,
    ProjectUpdate,
    TemplateApplied,
)
from app.services.health import apply_health_patch
from app.services.project_templates import capture_project_settings, materialize_project_settings
from app.services.storage import LocalStorage
from app.services.workspace_features import INITIATIVES_FEATURE, feature_enabled

router = APIRouter()

# Top-N initiatives per project row (v51.1 R1-③); the rest is a count.
INITIATIVE_ROLLUP_CAP = 5
PROJECT_COVER_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
PROJECT_COVER_FORMATS = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/gif": "GIF",
    "image/webp": "WEBP",
}
PROJECT_COVER_MAX_EDGE = 10_000
PROJECT_COVER_MAX_PIXELS = 24_000_000
PROJECT_COVER_MAX_FRAMES = 120
PROJECT_COVER_MAX_TOTAL_PIXELS = 40_000_000
PROJECT_COVER_DECODE_LIMITER = CapacityLimiter(1)


def _valid_cover_blob(storage_key: str | None, content_type: str | None, storage_dir: str) -> bool:
    if storage_key is None or content_type not in PROJECT_COVER_IMAGE_TYPES:
        return False
    path = LocalStorage(storage_dir).path(storage_key)
    if path is None:
        return False
    try:
        with Image.open(path) as image:
            width, height = image.size
            frame_count = getattr(image, "n_frames", 1)
            if (
                image.format != PROJECT_COVER_FORMATS[content_type]
                or width <= 0
                or height <= 0
                or width > PROJECT_COVER_MAX_EDGE
                or height > PROJECT_COVER_MAX_EDGE
                or width * height > PROJECT_COVER_MAX_PIXELS
                or frame_count <= 0
                or frame_count > PROJECT_COVER_MAX_FRAMES
                or width * height * frame_count > PROJECT_COVER_MAX_TOTAL_PIXELS
            ):
                return False
            for frame in ImageSequence.Iterator(image):
                frame.load()
    except (OSError, SyntaxError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        return False
    return True


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
    role_agg: dict = {}
    if ids:
        # Rollups share the visible scope by construction (project_id IN the
        # returned ids). utc_today binds from the API layer — never the DB
        # session timezone (v22.1 R1-②).
        today_utc = utc_today()
        open_filter = WorkPackage.status.notin_(WP_CLOSED_STATUSES)
        wp_rows = (
            await session.execute(
                select(
                    WorkPackage.project_id,
                    func.count().label("total"),
                    func.count().filter(open_filter).label("open"),
                    func.count()
                    .filter(open_filter, WorkPackage.due_date < today_utc)
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
        role_rows = (
            await session.execute(
                select(ProjectMember.project_id, ProjectMember.role).where(
                    ProjectMember.project_id.in_(ids),
                    ProjectMember.user_id == user.id,
                )
            )
        ).all()
        role_agg = dict(role_rows)

    # Initiative rollup (Pass 51, v51.1): a SEPARATE aggregate query — the
    # many-to-many never joins into the row/count queries (no distortion).
    # Connection implies visibility (every listed project is the caller's).
    ini_agg: dict = {}
    if ids and await feature_enabled(session, INITIATIVES_FEATURE):
        ini_rows = (
            await session.execute(
                select(InitiativeProject.project_id, Initiative.id, Initiative.name)
                .join(Initiative, InitiativeProject.initiative_id == Initiative.id)
                .where(InitiativeProject.project_id.in_(ids))
                .order_by(Initiative.name.asc(), Initiative.id.asc())
            )
        ).all()
        for pid, ini_id, ini_name in ini_rows:
            ini_agg.setdefault(pid, []).append(ProjectInitiativeRef(id=ini_id, name=ini_name))

    items = []
    for p in rows:
        item = ProjectListItem(
            **ProjectRead.model_validate(p).model_dump(),
            current_user_role=role_agg[p.id],
        )
        t, o, ov = wp_agg.get(p.id, (0, 0, 0))
        item.work_package_count = t
        item.open_work_package_count = o
        item.overdue_count = ov
        item.member_count = member_agg.get(p.id, 0)
        connected = ini_agg.get(p.id, [])
        item.initiatives = connected[:INITIATIVE_ROLLUP_CAP]
        item.initiative_overflow = max(0, len(connected) - INITIATIVE_ROLLUP_CAP)
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
            still_member = await session.scalar(
                select(
                    select(ProjectMember.id)
                    .where(
                        ProjectMember.project_id == body.template_project_id,
                        ProjectMember.user_id == user_id,
                    )
                    .exists()
                )
            )
            if not still_member:
                raise HTTPException(status_code=404, detail="not found")
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
            snapshot = await capture_project_settings(session, body.template_project_id)
            applied_snapshot = await materialize_project_settings(session, project.id, snapshot)
            applied = TemplateApplied(**applied_snapshot.model_dump())
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="project key already exists") from exc
    response = ProjectCreateResponse.model_validate(project)
    response.template_applied = applied
    return response


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


@router.get(
    "/{project_id}/health-history",
    response_model=ProjectHealthHistoryList,
)
async def list_project_health_history(
    project_id: uuid.UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectHealthHistoryList:
    await require_member(session, project_id, user)
    predicate = ProjectHealthHistory.project_id == project_id
    total = await session.scalar(
        select(func.count()).select_from(ProjectHealthHistory).where(predicate)
    )
    rows = (
        await session.execute(
            select(ProjectHealthHistory, User.display_name)
            .outerjoin(User, ProjectHealthHistory.changed_by == User.id)
            .where(predicate)
            .order_by(
                ProjectHealthHistory.created_at.desc(),
                ProjectHealthHistory.id.desc(),
            )
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return ProjectHealthHistoryList(
        items=[
            ProjectHealthHistoryRead(
                **ProjectHealthHistoryRead.model_validate(history).model_dump(
                    exclude={"changed_by_name"}
                ),
                changed_by_name=display_name,
            )
            for history, display_name in rows
        ],
        total=total or 0,
    )


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ProjectRead:
    # Project settings (name/description/budget) are owner-only (404 non-member).
    await require_role(session, project_id, user, {"owner"}, write=True)
    project = (
        await session.execute(select(Project).where(Project.id == project_id).with_for_update())
    ).scalar_one()
    fields = body.model_dump(exclude_unset=True)
    health_was_requested = "health" in fields
    previous_health = project.health
    previous_note = project.health_note
    previous_health_updated_by = project.health_updated_by
    previous_health_updated_at = project.health_updated_at
    # `name` is NOT NULL: an explicit null is a client error (422), never an
    # unhandled IntegrityError → 500 (fable5 audit: PATCH null-semantics).
    if "name" in fields and fields["name"] is None:
        raise HTTPException(status_code=422, detail="name cannot be null")
    if (cover_id := fields.get("cover_attachment_id")) is not None:
        cover = (
            await session.execute(
                select(Attachment).where(
                    Attachment.id == cover_id,
                    Attachment.project_id == project_id,
                    Attachment.storage_key.is_not(None),
                    Attachment.content_type.in_(PROJECT_COVER_IMAGE_TYPES),
                )
            )
        ).scalar_one_or_none()
        valid_cover = False
        if cover is not None:
            valid_cover = await to_thread.run_sync(
                _valid_cover_blob,
                cover.storage_key,
                cover.content_type,
                settings.storage_dir,
                limiter=PROJECT_COVER_DECODE_LIMITER,
            )
        if not valid_cover:
            raise HTTPException(
                status_code=422,
                detail="cover must be an uploaded raster image from this project",
            )
    # Health transition table (v37.1 R1-②; shared pure helper since Pass 44).
    apply_health_patch(project, fields, user.id)
    if health_was_requested:
        if (previous_health, previous_note) != (project.health, project.health_note):
            session.add(
                ProjectHealthHistory(
                    project_id=project_id,
                    previous_health=previous_health,
                    previous_note=previous_note,
                    health=project.health,
                    note=project.health_note,
                    changed_by=user.id,
                )
            )
        else:
            # An identical explicit report is a true no-op: its latest stamp
            # and append-only history remain aligned.
            project.health_updated_by = previous_health_updated_by
            project.health_updated_at = previous_health_updated_at
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
    project = (
        await session.execute(select(Project).where(Project.id == project_id).with_for_update())
    ).scalar_one()
    if project.archived_at is None:
        now = (await session.execute(select(func.now()))).scalar_one()
        project.archived_at = now
        publication = (
            await session.execute(
                select(ProjectPublication)
                .where(ProjectPublication.project_id == project_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if publication is not None and publication.revoked_at is None:
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
