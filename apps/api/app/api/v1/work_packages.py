import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy import update as sa_update
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.project_types import require_type_enabled
from app.core.auth import get_current_user
from app.core.authz import is_member, require_active_project, require_member
from app.db.session import get_session
from app.models.cycle import Cycle
from app.models.milestone import Milestone
from app.models.module import Module
from app.models.relation import WorkPackageRelation
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.work_package import (
    ConflictResponse,
    RelationCreate,
    RelationList,
    RelationRead,
    WorkPackageCreate,
    WorkPackageList,
    WorkPackagePatch,
    WorkPackageRead,
)
from app.services.activity import record_created, record_field_changes
from app.services.automation import extra_changes_for_status
from app.services.notification import notify_watchers, record_assignment
from app.services.sanitize import sanitize_html

logger = logging.getLogger("oneflow.work_packages")

router = APIRouter()

# Advisory-lock classid for parent-change serialization (PLAN §6.2). Hash collisions
# between different projects are harmless: they only cause extra serialization,
# never a correctness issue. Exactly ONE advisory lock per transaction — no lock
# ordering exists, so lock-order deadlock is structurally impossible.
PARENT_LOCK_CLASSID = 427001

StatusFilter = Literal["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]
PriorityFilter = Literal["none", "low", "medium", "high", "urgent"]
TypeFilter = Literal["task", "bug", "feature", "milestone"]
SortField = Literal["created", "subject"]

NON_NULLABLE_PATCH_FIELDS = {"subject", "type", "status", "priority"}
PATCH_DATA_FIELDS = (
    "subject",
    "description",
    "type",
    "status",
    "priority",
    "assignee_id",
    "parent_id",
    "milestone_id",
    "cycle_id",
    "module_id",
    "start_date",
    "due_date",
    "estimated_hours",
)


async def _get_wp_scoped(
    session: AsyncSession, wp_id: uuid.UUID, user: User, *, write: bool = False
) -> WorkPackage:
    wp = (
        await session.execute(select(WorkPackage).where(WorkPackage.id == wp_id))
    ).scalar_one_or_none()
    if wp is None or not await is_member(session, wp.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")
    if write:
        await require_active_project(session, wp.project_id)
    return wp


async def require_wp_member(
    session: AsyncSession, wp_id: uuid.UUID, user: User, *, write: bool = False
) -> WorkPackage:
    """Public membership guard for work-package sub-resources (comments/activities).

    Returns the work package or raises 404 (existence hiding for non-members);
    write=True additionally rejects archived projects with 409."""
    return await _get_wp_scoped(session, wp_id, user, write=write)


async def _require_assignee_member(
    session: AsyncSession, project_id: uuid.UUID, assignee_id: uuid.UUID
) -> None:
    if not await is_member(session, project_id, assignee_id):
        raise HTTPException(status_code=422, detail="assignee must be a member of the project")


async def _require_milestone_in_project(
    session: AsyncSession, project_id: uuid.UUID, milestone_id: uuid.UUID
) -> None:
    m = (
        await session.execute(select(Milestone).where(Milestone.id == milestone_id))
    ).scalar_one_or_none()
    if m is None or m.project_id != project_id:
        raise HTTPException(status_code=422, detail="milestone must belong to the same project")


async def _require_cycle_in_project(
    session: AsyncSession, project_id: uuid.UUID, cycle_id: uuid.UUID
) -> None:
    # Clean 422 for the UI; the composite FK is the authoritative DB-level guard.
    c = (await session.execute(select(Cycle).where(Cycle.id == cycle_id))).scalar_one_or_none()
    if c is None or c.project_id != project_id:
        raise HTTPException(status_code=422, detail="cycle must belong to the same project")


async def _require_module_in_project(
    session: AsyncSession, project_id: uuid.UUID, module_id: uuid.UUID
) -> None:
    # Clean 422 for the UI; the composite FK is the authoritative DB-level guard.
    m = (await session.execute(select(Module).where(Module.id == module_id))).scalar_one_or_none()
    if m is None or m.project_id != project_id:
        raise HTTPException(status_code=422, detail="module must belong to the same project")


@router.get("/projects/{project_id}/work-packages", response_model=WorkPackageList)
async def list_work_packages(
    project_id: uuid.UUID,
    status: StatusFilter | None = Query(default=None),
    priority: PriorityFilter | None = Query(default=None),
    type: TypeFilter | None = Query(default=None),
    assignee_id: uuid.UUID | None = Query(default=None),
    cycle_id: uuid.UUID | None = Query(default=None),
    module_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, max_length=255),
    sort: SortField = Query(default="created"),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkPackageList:
    await require_member(session, project_id, user)
    stmt = select(WorkPackage).where(WorkPackage.project_id == project_id)
    if status is not None:
        stmt = stmt.where(WorkPackage.status == status)
    if priority is not None:
        stmt = stmt.where(WorkPackage.priority == priority)
    if type is not None:
        stmt = stmt.where(WorkPackage.type == type)
    if assignee_id is not None:
        stmt = stmt.where(WorkPackage.assignee_id == assignee_id)
    if cycle_id is not None:
        stmt = stmt.where(WorkPackage.cycle_id == cycle_id)
    if module_id is not None:
        stmt = stmt.where(WorkPackage.module_id == module_id)
    if q:
        # Case-insensitive substring; % and _ wildcards are autoescaped (§6.1).
        stmt = stmt.where(WorkPackage.subject.icontains(q, autoescape=True))
    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    if sort == "subject":
        # Korean dictionary order via the ICU collation (migration 0010). Used only
        # here in ORDER BY, so the subject ILIKE filter above is unaffected.
        order = (WorkPackage.subject.collate("oneflow_korean").asc(), WorkPackage.id.asc())
    else:
        order = (WorkPackage.created_at.asc(), WorkPackage.id.asc())
    rows = (
        (await session.execute(stmt.order_by(*order).limit(limit).offset(offset))).scalars().all()
    )
    return WorkPackageList(items=[WorkPackageRead.model_validate(w) for w in rows], total=total)


@router.post(
    "/projects/{project_id}/work-packages", response_model=WorkPackageRead, status_code=201
)
async def create_work_package(
    project_id: uuid.UUID,
    body: WorkPackageCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkPackageRead:
    await require_member(session, project_id, user, write=True)
    # New usage of a disabled work-item type is rejected (Pass 7 PR-R).
    await require_type_enabled(session, project_id, body.type)
    if body.assignee_id is not None:
        await _require_assignee_member(session, project_id, body.assignee_id)
    if body.milestone_id is not None:
        await _require_milestone_in_project(session, project_id, body.milestone_id)
    if body.cycle_id is not None:
        await _require_cycle_in_project(session, project_id, body.cycle_id)
    if body.module_id is not None:
        await _require_module_in_project(session, project_id, body.module_id)
    if body.parent_id is not None:
        parent = (
            await session.execute(select(WorkPackage).where(WorkPackage.id == body.parent_id))
        ).scalar_one_or_none()
        if parent is None or parent.project_id != project_id:
            raise HTTPException(status_code=422, detail="parent must exist in the same project")
    data = body.model_dump()
    # Rich-text description is sanitized at the write boundary (§ Tiptap XSS).
    data["description"] = sanitize_html(data["description"])
    wp = WorkPackage(project_id=project_id, created_by=user.id, **data)
    session.add(wp)
    await session.flush()  # assigns wp.id for the activity FK
    record_created(session, wp.id, user.id)
    if body.assignee_id is not None:
        await record_assignment(
            session,
            recipient_id=body.assignee_id,
            actor_id=user.id,
            project_id=project_id,
            wp_id=wp.id,
        )
    await session.flush()
    await session.commit()
    return WorkPackageRead.model_validate(wp)


@router.get("/work-packages/{wp_id}", response_model=WorkPackageRead)
async def get_work_package(
    wp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkPackageRead:
    wp = await _get_wp_scoped(session, wp_id, user)
    return WorkPackageRead.model_validate(wp)


def _effective_dates(wp: WorkPackage, changes: dict) -> None:
    start = changes.get("start_date", wp.start_date)
    due = changes.get("due_date", wp.due_date)
    if start is not None and due is not None and start > due:
        raise HTTPException(status_code=422, detail="start_date must be <= due_date")


async def _check_parent_guards(
    session: AsyncSession, wp: WorkPackage, new_parent_id: uuid.UUID
) -> None:
    """Self/cross-project/cycle guards. Caller must hold the project advisory lock."""
    if new_parent_id == wp.id:
        raise HTTPException(status_code=422, detail="work package cannot be its own parent")
    parent = (
        await session.execute(select(WorkPackage).where(WorkPackage.id == new_parent_id))
    ).scalar_one_or_none()
    if parent is None or parent.project_id != wp.project_id:
        raise HTTPException(status_code=422, detail="parent must exist in the same project")
    # Ancestor walk — hierarchy is same-project (DB-enforced), bounded by project size.
    seen: set[uuid.UUID] = set()
    cursor: uuid.UUID | None = new_parent_id
    while cursor is not None and cursor not in seen:
        if cursor == wp.id:
            raise HTTPException(status_code=422, detail="parent change would create a cycle")
        seen.add(cursor)
        cursor = (
            await session.execute(select(WorkPackage.parent_id).where(WorkPackage.id == cursor))
        ).scalar_one_or_none()
    if cursor is not None:  # pre-existing cycle encountered defensively
        raise HTTPException(status_code=422, detail="parent chain integrity error")


@router.patch(
    "/work-packages/{wp_id}",
    response_model=WorkPackageRead,
    responses={409: {"model": ConflictResponse}},
)
async def patch_work_package(
    wp_id: uuid.UUID,
    body: WorkPackagePatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    wp = await _get_wp_scoped(session, wp_id, user, write=True)

    provided = body.model_fields_set - {"expected_version"}
    for field in provided & NON_NULLABLE_PATCH_FIELDS:
        if getattr(body, field) is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")

    changes = {f: getattr(body, f) for f in PATCH_DATA_FIELDS if f in provided}
    if "description" in changes:
        # Sanitize rich text on write (server is the authoritative XSS boundary).
        changes["description"] = sanitize_html(changes["description"])

    # Empty body: no write occurs — conditional token compare only, no version bump (§6.2).
    if not changes:
        fresh = await _reselect_fresh(session, wp_id)
        if fresh is None:
            raise HTTPException(status_code=404, detail="not found")
        if fresh.version != body.expected_version:
            return _conflict_response(fresh)
        return WorkPackageRead.model_validate(fresh)

    _effective_dates(wp, changes)
    if changes.get("type") is not None and changes["type"] != wp.type:
        # Enablement bites only on a REAL type change — a drawer echoing the
        # current (possibly disabled) type back must not block other edits.
        await require_type_enabled(session, wp.project_id, changes["type"])
    if changes.get("assignee_id") is not None:
        await _require_assignee_member(session, wp.project_id, changes["assignee_id"])
    if changes.get("milestone_id") is not None:
        await _require_milestone_in_project(session, wp.project_id, changes["milestone_id"])
    if changes.get("cycle_id") is not None:
        await _require_cycle_in_project(session, wp.project_id, changes["cycle_id"])
    if changes.get("module_id") is not None:
        await _require_module_in_project(session, wp.project_id, changes["module_id"])

    # Automation (§3 Phase 3): a real status change can imply further field writes
    # from active project rules. Single-pass and only fills fields the user did not
    # set explicitly, so it never overrides user input or re-triggers itself.
    if changes.get("status") is not None and changes["status"] != wp.status:
        for field, value in (
            await extra_changes_for_status(session, wp.project_id, changes["status"])
        ).items():
            changes.setdefault(field, value)

    # Capture pre-update values for the activity log BEFORE the UPDATE (the
    # populate_existing UPDATE below refreshes the identity-mapped wp in place).
    old_values = {f: getattr(wp, f) for f in changes}

    parent_changing = "parent_id" in changes and changes["parent_id"] is not None
    # Single transaction (autobegin → commit): optional advisory lock + guards +
    # the single atomic conditional UPDATE (§6.2). read-compare-write is forbidden.
    try:
        if parent_changing:
            # Serialize parent changes per project (PLAN §6.2): exactly one
            # advisory lock per transaction, 5s wait ceiling.
            await session.execute(text("SET LOCAL lock_timeout = '5s'"))
            await session.execute(
                text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
                    classid=PARENT_LOCK_CLASSID, pid=str(wp.project_id)
                )
            )
            await _check_parent_guards(session, wp, changes["parent_id"])
        stmt = (
            sa_update(WorkPackage)
            .where(WorkPackage.id == wp_id, WorkPackage.version == body.expected_version)
            .values(**changes, version=WorkPackage.version + 1, updated_at=func.now())
            .returning(WorkPackage)
            # populate_existing: the RETURNING row must overwrite the identity-mapped
            # instance loaded earlier, or the response would carry stale values.
            .execution_options(synchronize_session=False, populate_existing=True)
        )
        updated = (await session.execute(stmt)).scalar_one_or_none()
        if updated is not None:
            # Record field changes in the same transaction as the update.
            record_field_changes(session, wp_id, user.id, old_values, changes)
            # Notify on a real (re)assignment to a new user.
            new_assignee = changes.get("assignee_id")
            assignee_changed = (
                new_assignee is not None and old_values.get("assignee_id") != new_assignee
            )
            if assignee_changed:
                await record_assignment(
                    session,
                    recipient_id=new_assignee,
                    actor_id=user.id,
                    project_id=wp.project_id,
                    wp_id=wp_id,
                )
            # Watcher fan-out (same transaction; PR-E1). The new assignee already
            # got the richer 'assigned' notification → excluded from watch_assigned.
            if changes.get("status") is not None and changes["status"] != old_values.get("status"):
                await notify_watchers(
                    session,
                    wp_id=wp_id,
                    project_id=wp.project_id,
                    actor_id=user.id,
                    kind="watch_status",
                )
            if assignee_changed:
                await notify_watchers(
                    session,
                    wp_id=wp_id,
                    project_id=wp.project_id,
                    actor_id=user.id,
                    kind="watch_assigned",
                    exclude=(new_assignee,),
                )
            await session.flush()
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except DBAPIError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "55P03":  # lock_timeout
            return JSONResponse(
                status_code=503,
                content={"detail": "parent change busy — retry shortly"},
            )
        raise

    if updated is not None:
        return WorkPackageRead.model_validate(updated)

    # 0 rows affected: distinguish 404 vs 409 by re-select.
    fresh = await _reselect_fresh(session, wp_id)
    if fresh is None:
        raise HTTPException(status_code=404, detail="not found")
    return _conflict_response(fresh)


async def _reselect_fresh(session: AsyncSession, wp_id: uuid.UUID) -> WorkPackage | None:
    """Re-select bypassing the identity-map snapshot (review finding #1).

    The request loaded this row earlier in _get_wp_scoped; with
    expire_on_commit=False a plain select would return that stale instance,
    so a concurrent writer's committed changes would be invisible in the
    409 `current` payload / empty-body compare. populate_existing forces the
    fresh DB row onto the identity-mapped instance."""
    return (
        await session.execute(
            select(WorkPackage)
            .where(WorkPackage.id == wp_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


def _conflict_response(current: WorkPackage) -> JSONResponse:
    payload = ConflictResponse(
        detail="version conflict — resource was modified by someone else",
        current=WorkPackageRead.model_validate(current),
    )
    return JSONResponse(status_code=409, content=jsonable_encoder(payload))


@router.get("/work-packages/{wp_id}/relations", response_model=RelationList)
async def list_relations(
    wp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> RelationList:
    wp = await _get_wp_scoped(session, wp_id, user)
    src = WorkPackage.__table__.alias("src")
    tgt = WorkPackage.__table__.alias("tgt")
    # Same-project invariant condition is ALWAYS part of the read query (§6.1),
    # independent of the DB-level composite FKs (defense in depth).
    stmt = (
        select(WorkPackageRelation)
        .join(src, WorkPackageRelation.source_id == src.c.id)
        .join(tgt, WorkPackageRelation.target_id == tgt.c.id)
        .where(
            (WorkPackageRelation.source_id == wp_id) | (WorkPackageRelation.target_id == wp_id),
            WorkPackageRelation.project_id == wp.project_id,
            src.c.project_id == wp.project_id,
            tgt.c.project_id == wp.project_id,
        )
        .order_by(WorkPackageRelation.created_at.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    items = [
        RelationRead(
            id=r.id,
            source_id=r.source_id,
            target_id=r.target_id,
            relation_type=r.relation_type,
            direction="outgoing" if r.source_id == wp_id else "incoming",
        )
        for r in rows
    ]
    return RelationList(items=items, total=len(items))


@router.post("/work-packages/{wp_id}/relations", response_model=RelationRead, status_code=201)
async def create_relation(
    wp_id: uuid.UUID,
    body: RelationCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> RelationRead:
    wp = await _get_wp_scoped(session, wp_id, user, write=True)
    if body.target_id == wp_id:
        raise HTTPException(status_code=422, detail="a work package cannot relate to itself")
    target = (
        await session.execute(select(WorkPackage).where(WorkPackage.id == body.target_id))
    ).scalar_one_or_none()
    if target is None or target.project_id != wp.project_id:
        raise HTTPException(status_code=422, detail="target must exist in the same project")
    relation = WorkPackageRelation(
        project_id=wp.project_id,
        source_id=wp_id,
        target_id=body.target_id,
        relation_type=body.relation_type,
    )
    try:
        session.add(relation)
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        # unique(source, target, type) violation
        raise HTTPException(status_code=409, detail="relation already exists") from exc
    return RelationRead(
        id=relation.id,
        source_id=relation.source_id,
        target_id=relation.target_id,
        relation_type=relation.relation_type,
        direction="outgoing",
    )


@router.delete("/work-packages/{wp_id}/relations/{relation_id}", status_code=204)
async def delete_relation(
    wp_id: uuid.UUID,
    relation_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    wp = await _get_wp_scoped(session, wp_id, user, write=True)
    relation = (
        await session.execute(
            select(WorkPackageRelation).where(WorkPackageRelation.id == relation_id)
        )
    ).scalar_one_or_none()
    # The relation must touch this work package (its view) and be same-project.
    if (
        relation is None
        or relation.project_id != wp.project_id
        or wp_id not in (relation.source_id, relation.target_id)
    ):
        raise HTTPException(status_code=404, detail="not found")
    await session.delete(relation)
    await session.commit()
    return Response(status_code=204)
