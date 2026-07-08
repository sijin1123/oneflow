import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select, text
from sqlalchemy import update as sa_update
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.project_types import require_type_enabled
from app.core.auth import get_current_user
from app.core.authz import (
    is_member,
    member_role,
    require_active_project,
    require_member,
    require_role,
    require_writer,
)
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.cycle import Cycle
from app.models.milestone import Milestone
from app.models.module import Module
from app.models.relation import WorkPackageRelation
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.work_package import (
    BulkUpdateRequest,
    BulkUpdateResult,
    ConflictResponse,
    MoveCleared,
    MoveRefSummary,
    ProjectRelationList,
    ProjectRelationRead,
    RelationCreate,
    RelationList,
    RelationRead,
    WorkPackageCreate,
    WorkPackageDuplicateResult,
    WorkPackageList,
    WorkPackageMove,
    WorkPackageMoveResult,
    WorkPackagePatch,
    WorkPackageRead,
)
from app.services.activity import record_created, record_field_changes
from app.services.automation import bump_fired, change_candidates, record_applied
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
        await require_writer(session, wp.project_id, user.id)
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
    role = await member_role(session, project_id, assignee_id)
    if role is None:
        raise HTTPException(status_code=422, detail="assignee must be a member of the project")
    if role == "viewer":
        raise HTTPException(status_code=422, detail="assignee must not have a read-only role")


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


# Custom-field list columns (Pass 67, v67.1): the list accepts up to five
# ACTIVE project fields and batch-attaches their stored values to the page.
CUSTOM_FIELD_COLUMN_CAP = 5
_CUSTOM_FIELDS_422 = "custom_fields must be up to 5 active field ids of this project"


async def _parse_custom_fields(
    session: AsyncSession, project_id: uuid.UUID, raw: str | None
) -> list[uuid.UUID] | None:
    """v67.1 R1-④ normalization: split → trim → empty token 422 → UUID parse
    422 → first-occurrence dedup → cap AFTER dedup → request order kept.
    Validation is project-scoped ONLY, and every rejection (missing / foreign
    / inactive / malformed) is the SAME generic 422 — a foreign field id is
    indistinguishable from a random one (R1-②/③)."""
    if raw is None:
        return None
    ids: list[uuid.UUID] = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            raise HTTPException(status_code=422, detail=_CUSTOM_FIELDS_422)
        try:
            fid = uuid.UUID(token)
        except ValueError:
            raise HTTPException(status_code=422, detail=_CUSTOM_FIELDS_422) from None
        if fid not in ids:
            ids.append(fid)
    if len(ids) > CUSTOM_FIELD_COLUMN_CAP:
        raise HTTPException(status_code=422, detail=_CUSTOM_FIELDS_422)
    from app.models.custom_field import CustomField

    known = set(
        (
            await session.execute(
                select(CustomField.id).where(
                    CustomField.project_id == project_id,
                    CustomField.id.in_(ids),
                    CustomField.is_active.is_(True),
                )
            )
        ).scalars()
    )
    if len(known) != len(ids):
        raise HTTPException(status_code=422, detail=_CUSTOM_FIELDS_422)
    return ids


async def _attach_custom_values(
    session: AsyncSession, items: list[WorkPackageRead], field_ids: list[uuid.UUID]
) -> None:
    """ONE batch SELECT for page×fields (never per-row); member names resolve
    in a second tiny query (the single-WP endpoint's exact shape). A field
    deleted between validation and here converges to empty cells (R1-⑤)."""
    from app.models.custom_field import CustomField, WpCustomValue
    from app.schemas.custom_field import CustomValueRead

    if not items or not field_ids:
        for item in items:
            item.custom_values = []
        return
    wp_ids = [item.id for item in items]
    rows = (
        await session.execute(
            select(WpCustomValue, CustomField.field_type)
            .join(CustomField, WpCustomValue.field_id == CustomField.id)
            .where(
                WpCustomValue.work_package_id.in_(wp_ids),
                WpCustomValue.field_id.in_(field_ids),
            )
        )
    ).all()
    member_ids = {uuid.UUID(v.value) for v, ftype in rows if ftype == "member"}
    names: dict[uuid.UUID, str] = {}
    if member_ids:
        names = dict(
            (
                await session.execute(
                    select(User.id, User.display_name).where(User.id.in_(member_ids))
                )
            ).all()
        )
    by_wp: dict[uuid.UUID, list] = {}
    for v, ftype in rows:
        by_wp.setdefault(v.work_package_id, []).append(
            CustomValueRead(
                field_id=v.field_id,
                value=v.value,
                member_display_name=(
                    names.get(uuid.UUID(v.value), "(삭제된 사용자)") if ftype == "member" else None
                ),
            )
        )
    for item in items:
        item.custom_values = by_wp.get(item.id, [])


@router.get("/projects/{project_id}/work-packages", response_model=WorkPackageList)
async def list_work_packages(
    project_id: uuid.UUID,
    status: StatusFilter | None = Query(default=None),
    priority: PriorityFilter | None = Query(default=None),
    type: TypeFilter | None = Query(default=None),
    assignee_id: uuid.UUID | None = Query(default=None),
    cycle_id: uuid.UUID | None = Query(default=None),
    # Backlog filters (Pass 52, v52.1): pure additive ANDs inside the scoped
    # WHERE. no_cycle=true is cycle_id IS NULL (contradictory with cycle_id →
    # 422); open_only=true excludes the fixed closed vocabulary.
    no_cycle: bool = Query(default=False),
    open_only: bool = Query(default=False),
    module_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, max_length=255),
    custom_fields: str | None = Query(default=None, max_length=255),
    sort: SortField = Query(default="created"),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkPackageList:
    await require_member(session, project_id, user)
    requested_fields = await _parse_custom_fields(session, project_id, custom_fields)
    stmt = select(WorkPackage).where(WorkPackage.project_id == project_id)
    if status is not None:
        stmt = stmt.where(WorkPackage.status == status)
    if priority is not None:
        stmt = stmt.where(WorkPackage.priority == priority)
    if type is not None:
        stmt = stmt.where(WorkPackage.type == type)
    if assignee_id is not None:
        stmt = stmt.where(WorkPackage.assignee_id == assignee_id)
    if no_cycle and cycle_id is not None:
        raise HTTPException(status_code=422, detail="no_cycle contradicts cycle_id")
    if cycle_id is not None:
        stmt = stmt.where(WorkPackage.cycle_id == cycle_id)
    if no_cycle:
        stmt = stmt.where(WorkPackage.cycle_id.is_(None))
    if open_only:
        stmt = stmt.where(WorkPackage.status.not_in(WP_CLOSED_STATUSES))
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
    items = [WorkPackageRead.model_validate(w) for w in rows]
    if requested_fields is not None:
        await _attach_custom_values(session, items, requested_fields)
    return WorkPackageList(items=items, total=total)


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


@router.post("/projects/{project_id}/work-packages/bulk-update", response_model=BulkUpdateResult)
async def bulk_update_work_packages(
    project_id: uuid.UUID,
    body: BulkUpdateRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BulkUpdateResult:
    """Bulk simple-assignment update (Pass 12 PR-AB, PLAN v12.1 R1-①②⑥).

    Single transaction, all-or-nothing over the rows found: SELECT..FOR UPDATE
    the project-scoped rows, validate the uniform patch ONCE up front (422
    before any write), then per row: snapshot old values, skip unchanged rows,
    assign + version+1, record field changes and assignment notifications for
    real changes only. ids not found in this project return as opaque
    skipped_ids (missing and cross-project look identical — existence hiding).
    Deliberate §6.2 exception: no per-row version token (simple assignments,
    list-scale cleanup; the drawer's precision PATCH keeps the token)."""
    await require_member(session, project_id, user, write=True)

    provided = body.patch.model_fields_set
    if not provided:
        raise HTTPException(status_code=422, detail="patch must set at least one field")
    if "status" in provided and body.patch.status is None:
        raise HTTPException(status_code=422, detail="status cannot be null")
    if "priority" in provided and body.patch.priority is None:
        raise HTTPException(status_code=422, detail="priority cannot be null")
    if body.patch.assignee_id is not None:
        await _require_assignee_member(session, project_id, body.patch.assignee_id)

    rows = (
        (
            await session.execute(
                select(WorkPackage)
                .where(WorkPackage.id.in_(body.ids), WorkPackage.project_id == project_id)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    by_id = {row.id: row for row in rows}
    skipped = [i for i in body.ids if i not in by_id]

    patch_fields = {f: getattr(body.patch, f) for f in provided}
    # Bulk supports status/priority/assignee — status AND priority changes
    # fire automation (type is not bulk-editable). Fired sets are PER ROW
    # (old≠new only — v41.1 R1-①/②); candidates are cached per distinct
    # fired subset (at most 4 for two triggers).
    bulk_triggers = {
        t: f
        for t, f in (("status_changed_to", "status"), ("priority_changed_to", "priority"))
        if f in patch_fields
    }
    candidates_cache: dict[frozenset, dict] = {}

    updated: list[uuid.UUID] = []
    unchanged: list[uuid.UUID] = []
    for wp_id in body.ids:
        wp = by_id.get(wp_id)
        if wp is None:
            continue
        changes = {f: v for f, v in patch_fields.items() if getattr(wp, f) != v}
        row_fired = {t: patch_fields[f] for t, f in bulk_triggers.items() if f in changes}
        cache_key = frozenset(row_fired.items())
        if cache_key not in candidates_cache:
            candidates_cache[cache_key] = await change_candidates(session, project_id, row_fired)
        auto_candidates = candidates_cache[cache_key]
        row_auto: list = []  # automation fills unset fields only (user wins)
        for field, candidate in auto_candidates.items():
            if (
                field not in patch_fields
                and field not in changes
                and getattr(wp, field) != candidate.value
            ):
                changes[field] = candidate.value
                row_auto.append(candidate)
        if not changes:
            unchanged.append(wp_id)
            continue
        old_values = {f: getattr(wp, f) for f in changes}
        for field, value in changes.items():
            setattr(wp, field, value)
        wp.version += 1
        record_field_changes(session, wp_id, user.id, old_values, changes)
        applied_rules: set[uuid.UUID] = set()
        for candidate in row_auto:
            record_applied(
                session,
                candidate=candidate,
                project_id=project_id,
                wp_id=wp_id,
                wp_subject=wp.subject,
                actor_id=user.id,
                old_value=old_values.get(candidate.field),
                new_value=candidate.value,
            )
            applied_rules.add(candidate.rule_id)
        await bump_fired(session, applied_rules)
        new_assignee = changes.get("assignee_id")
        if new_assignee is not None:
            await record_assignment(
                session,
                recipient_id=new_assignee,
                actor_id=user.id,
                project_id=project_id,
                wp_id=wp_id,
            )
        updated.append(wp_id)
    await session.commit()
    return BulkUpdateResult(updated_ids=updated, unchanged_ids=unchanged, skipped_ids=skipped)


@router.post(
    "/work-packages/{wp_id}/duplicate",
    response_model=WorkPackageDuplicateResult,
    status_code=201,
)
async def duplicate_work_package(
    wp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkPackageDuplicateResult:
    """Same-project duplicate (Pass 12 PR-AA, PLAN v12.1).

    Copied: subject('(복사) ' prefix), description, type, priority, dates,
    estimate, milestone/cycle/module, assignee (only if STILL a member — R1-⑤),
    and custom values that pass the current write validation (active + bound +
    valid option/member — R1-④; the rest are counted, not copied).
    Not copied: status (→backlog — a duplicate starts over), parent (no tree
    duplication), relations, watchers, comments, activities, attachments,
    time/cost entries."""
    src = await _get_wp_scoped(session, wp_id, user, write=True)
    # A duplicate is NEW usage of the type — the disabled-type gate applies.
    await require_type_enabled(session, src.project_id, src.type)

    assignee = None
    if src.assignee_id is not None and await is_member(session, src.project_id, src.assignee_id):
        assignee = src.assignee_id

    subject = f"(복사) {src.subject}"[:255]
    dup = WorkPackage(
        project_id=src.project_id,
        subject=subject,
        description=src.description,
        type=src.type,
        status="backlog",
        priority=src.priority,
        assignee_id=assignee,
        milestone_id=src.milestone_id,
        cycle_id=src.cycle_id,
        module_id=src.module_id,
        start_date=src.start_date,
        due_date=src.due_date,
        estimated_hours=src.estimated_hours,
        created_by=user.id,
    )
    session.add(dup)
    await session.flush()
    record_created(session, dup.id, user.id)
    if assignee is not None:
        await record_assignment(
            session,
            recipient_id=assignee,
            actor_id=user.id,
            project_id=src.project_id,
            wp_id=dup.id,
        )

    # Custom values: re-run the same checks the write fan-in applies — a value
    # that would be rejected as a new write today is skipped, not smuggled.
    from app.api.v1.custom_fields import _validate_value
    from app.models.custom_field import CustomField, WpCustomValue
    from app.models.member import ProjectMember

    rows = (
        (
            await session.execute(
                select(WpCustomValue, CustomField)
                .join(CustomField, CustomField.id == WpCustomValue.field_id)
                .where(WpCustomValue.work_package_id == src.id)
            )
        )
        .tuples()
        .all()
    )
    skipped = 0
    if rows:
        member_ids: set[uuid.UUID] = set(
            (
                await session.execute(
                    select(ProjectMember.user_id).where(ProjectMember.project_id == src.project_id)
                )
            ).scalars()
        )
        for value_row, field in rows:
            if not field.is_active or (
                field.applies_to is not None and dup.type not in field.applies_to
            ):
                skipped += 1
                continue
            try:
                normalized = _validate_value(field, value_row.value, member_ids)
            except HTTPException:
                skipped += 1
                continue
            session.add(WpCustomValue(work_package_id=dup.id, field_id=field.id, value=normalized))

    await session.flush()
    await session.commit()
    return WorkPackageDuplicateResult(
        work_package=WorkPackageRead.model_validate(dup), skipped_custom_values=skipped
    )


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

    # Automation (§3 Phase 3): a real status/type/priority change can imply
    # further field writes from active project rules. Single-pass and only
    # fills fields the user did not set explicitly, so it never overrides
    # user input or re-triggers itself. `fired` holds REAL changes only —
    # a no-op field never fires (v41.1 R1-②).
    fired: dict[str, str] = {}
    for trigger_type, field in (
        ("status_changed_to", "status"),
        ("type_changed_to", "type"),
        ("priority_changed_to", "priority"),
    ):
        if changes.get(field) is not None and changes[field] != getattr(wp, field):
            fired[trigger_type] = changes[field]
    auto_candidates: dict = await change_candidates(session, wp.project_id, fired)
    for field, candidate in auto_candidates.items():
        changes.setdefault(field, candidate.value)

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
            # Automation accounting (v16.1: fired = run = ACTUALLY APPLIED) —
            # only candidates that survived the setdefault merge, really
            # changed the value, and rode the successful conditional UPDATE.
            applied_rules: set[uuid.UUID] = set()
            for field, candidate in auto_candidates.items():
                if (
                    changes.get(field) == candidate.value
                    and old_values.get(field) != candidate.value
                ):
                    record_applied(
                        session,
                        candidate=candidate,
                        project_id=wp.project_id,
                        wp_id=wp_id,
                        wp_subject=updated.subject,
                        actor_id=user.id,
                        old_value=old_values.get(field),
                        new_value=candidate.value,
                    )
                    applied_rules.add(candidate.rule_id)
            await bump_fired(session, applied_rules)
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


@router.get("/projects/{project_id}/relations", response_model=ProjectRelationList)
async def list_project_relations(
    project_id: uuid.UUID,
    limit: int = Query(default=500, ge=1, le=1000),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRelationList:
    """Every relation in the project (member read) — the timeline draws
    dependency connectors from this. Deterministic order, limit+1 truncation
    probe (v20.1 R1-① — relations are few per WP; a hard 1000 cap bounds the
    payload, revisit with pagination if projects outgrow it)."""
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(WorkPackageRelation)
                .where(WorkPackageRelation.project_id == project_id)
                .order_by(WorkPackageRelation.created_at.asc(), WorkPackageRelation.id.asc())
                .limit(limit + 1)
            )
        )
        .scalars()
        .all()
    )
    truncated = len(rows) > limit
    rows = rows[:limit]
    return ProjectRelationList(
        items=[ProjectRelationRead.model_validate(r) for r in rows],
        total=len(rows),
        truncated=truncated,
    )


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


# Cross-project move locks (Pass 66, v66.1 R1-③): acquired on BOTH projects in
# UUID order (deadlock-free), before the WP row lock and any quota lock.
MOVE_LOCK_CLASSID = 427009

_MOVE_NAME_CAP = 3


def _summary(names: list[str]) -> MoveRefSummary:
    return MoveRefSummary(
        count=len(names),
        names=names[:_MOVE_NAME_CAP],
        overflow=max(0, len(names) - _MOVE_NAME_CAP),
    )


@router.post("/work-packages/{wp_id}/move", response_model=WorkPackageMoveResult)
async def move_work_package(
    wp_id: uuid.UUID,
    body: WorkPackageMove,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """Move a work package to another project (Pass 66 PR-CF, v66.1).

    A move is a FULL transfer of ownership and visibility — comments, time,
    cost and history travel with the item (internal trust model; the source
    OWNER gate is the control). Project-scoped references cannot travel:
    parent/children links detach, relations / custom values / document links
    are deleted (previewed via dry_run first), watchers and the assignee are
    re-checked against target eligibility. Blob storage keys are immutable —
    quota and sweeps follow the DB project_id, never the key prefix."""
    from app.models.activity import Activity
    from app.models.attachment import Attachment
    from app.models.custom_field import CustomField, WpCustomValue
    from app.models.document import DocumentWorkPackageLink, ProjectDocument
    from app.models.member import ProjectMember
    from app.models.notification import Notification
    from app.models.project import Project
    from app.models.watcher import WpWatcher
    from app.services.storage_usage import used_bytes

    wp = (
        await session.execute(select(WorkPackage).where(WorkPackage.id == wp_id))
    ).scalar_one_or_none()
    if wp is None or not await is_member(session, wp.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")
    # Source OWNER (v66.1 R1-② — destructive cleanup + visibility transfer),
    # archived source refuses writes; then target membership/write.
    await require_role(session, wp.project_id, user, {"owner"}, write=True)
    await require_member(session, body.target_project_id, user, write=True)
    if body.target_project_id == wp.project_id:
        raise HTTPException(status_code=422, detail="target must be a different project")
    # The stored type key must be usable in the target (duplicate precedent —
    # explicit refusal beats a silent fallback).
    await require_type_enabled(session, body.target_project_id, wp.type)

    if not body.dry_run:
        # Deterministic two-project serialization, then the row itself.
        for pid in sorted((wp.project_id, body.target_project_id), key=str):
            await session.execute(
                text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
                    classid=MOVE_LOCK_CLASSID, pid=str(pid)
                )
            )
        wp = (
            await session.execute(
                select(WorkPackage).where(WorkPackage.id == wp_id).with_for_update()
            )
        ).scalar_one()
    if wp.version != body.expected_version:
        fresh = await _reselect_fresh(session, wp_id)
        return _conflict_response(fresh)

    # ---- gather the cleared-reference summaries (shared by dry_run) --------
    children = (
        (
            await session.execute(
                select(WorkPackage.subject)
                .where(WorkPackage.parent_id == wp_id)
                .order_by(WorkPackage.subject.asc())
            )
        )
        .scalars()
        .all()
    )
    rel_rows = (
        (
            await session.execute(
                select(WorkPackage.subject)
                .join(
                    WorkPackageRelation,
                    (
                        (WorkPackageRelation.source_id == wp_id)
                        & (WorkPackageRelation.target_id == WorkPackage.id)
                    )
                    | (
                        (WorkPackageRelation.target_id == wp_id)
                        & (WorkPackageRelation.source_id == WorkPackage.id)
                    ),
                )
                .order_by(WorkPackage.subject.asc())
            )
        )
        .scalars()
        .all()
    )
    cv_rows = (
        (
            await session.execute(
                select(CustomField.name)
                .join(WpCustomValue, WpCustomValue.field_id == CustomField.id)
                .where(WpCustomValue.work_package_id == wp_id)
                .order_by(CustomField.name.asc())
            )
        )
        .scalars()
        .all()
    )
    link_rows = (
        (
            await session.execute(
                select(ProjectDocument.title)
                .join(
                    DocumentWorkPackageLink,
                    DocumentWorkPackageLink.document_id == ProjectDocument.id,
                )
                .where(DocumentWorkPackageLink.work_package_id == wp_id)
                .order_by(ProjectDocument.title.asc())
            )
        )
        .scalars()
        .all()
    )
    # Watchers keep only target-eligible users (member AND not viewer AND active).
    eligible_watchers = set(
        (
            await session.execute(
                select(WpWatcher.user_id)
                .join(
                    ProjectMember,
                    (ProjectMember.user_id == WpWatcher.user_id)
                    & (ProjectMember.project_id == body.target_project_id),
                )
                .join(User, User.id == WpWatcher.user_id)
                .where(
                    WpWatcher.work_package_id == wp_id,
                    ProjectMember.role != "viewer",
                    User.is_active.is_(True),
                )
            )
        ).scalars()
    )
    removed_watchers = (
        (
            await session.execute(
                select(User.display_name)
                .join(WpWatcher, WpWatcher.user_id == User.id)
                .where(
                    WpWatcher.work_package_id == wp_id,
                    User.id.notin_(eligible_watchers) if eligible_watchers else True,
                )
                .order_by(User.display_name.asc())
            )
        )
        .scalars()
        .all()
    )
    assignee_cleared = False
    if wp.assignee_id is not None:
        role = await member_role(session, body.target_project_id, wp.assignee_id)
        active = (
            await session.execute(select(User.is_active).where(User.id == wp.assignee_id))
        ).scalar_one_or_none()
        assignee_cleared = role is None or role == "viewer" or active is not True

    cleared = MoveCleared(
        parent=wp.parent_id is not None,
        children=_summary(list(children)),
        milestone=wp.milestone_id is not None,
        cycle=wp.cycle_id is not None,
        module=wp.module_id is not None,
        relations=_summary(list(rel_rows)),
        custom_values=_summary(list(cv_rows)),
        document_links=_summary(list(link_rows)),
        watchers_removed=_summary(list(removed_watchers)),
        assignee_cleared=assignee_cleared,
    )
    if body.dry_run:
        return WorkPackageMoveResult(work_package=None, cleared=cleared, dry_run=True)

    # ---- attachment quota (target upload lock — the upload contract) -------
    moving_bytes = (
        await session.execute(
            select(func.coalesce(func.sum(Attachment.size_bytes), 0)).where(
                Attachment.work_package_id == wp_id
            )
        )
    ).scalar_one()
    att_count = (
        await session.execute(
            select(func.count()).select_from(Attachment).where(Attachment.work_package_id == wp_id)
        )
    ).scalar_one()
    if att_count:
        from app.api.v1.attachments import UPLOAD_LOCK_CLASSID

        await session.execute(
            text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
                classid=UPLOAD_LOCK_CLASSID, pid=str(body.target_project_id)
            )
        )
        # Settings via Depends — a direct get_settings() call would split-brain
        # against the app's explicit Settings (house review finding #5).
        if await used_bytes(session, body.target_project_id) + int(moving_bytes) > (
            settings.project_storage_quota_bytes
        ):
            raise HTTPException(status_code=413, detail="target project storage quota exceeded")

    # ---- apply (one transaction) --------------------------------------------
    old_project_id = wp.project_id
    names = dict(
        (
            await session.execute(
                select(Project.id, Project.name).where(
                    Project.id.in_([old_project_id, body.target_project_id])
                )
            )
        ).all()
    )
    await session.execute(
        sa_update(WorkPackage).where(WorkPackage.parent_id == wp_id).values(parent_id=None)
    )
    await session.execute(
        sa_delete(WorkPackageRelation).where(
            (WorkPackageRelation.source_id == wp_id) | (WorkPackageRelation.target_id == wp_id)
        )
    )
    await session.execute(sa_delete(WpCustomValue).where(WpCustomValue.work_package_id == wp_id))
    await session.execute(
        sa_delete(DocumentWorkPackageLink).where(DocumentWorkPackageLink.work_package_id == wp_id)
    )
    if eligible_watchers:
        await session.execute(
            sa_delete(WpWatcher).where(
                WpWatcher.work_package_id == wp_id,
                WpWatcher.user_id.notin_(eligible_watchers),
            )
        )
    else:
        await session.execute(sa_delete(WpWatcher).where(WpWatcher.work_package_id == wp_id))
    # Composite FK dance: attachments reference (work_package_id, project_id),
    # so neither side can change first. Detach the anchor, move the WP below,
    # re-anchor with the new project — one transaction, constraint never trips.
    moved_attachment_ids = (
        (await session.execute(select(Attachment.id).where(Attachment.work_package_id == wp_id)))
        .scalars()
        .all()
    )
    if moved_attachment_ids:
        await session.execute(
            sa_update(Attachment)
            .where(Attachment.id.in_(moved_attachment_ids))
            .values(work_package_id=None)
        )
    # Old notifications must deep-link into the CURRENT project (R1-⑤).
    await session.execute(
        sa_update(Notification)
        .where(Notification.work_package_id == wp_id)
        .values(project_id=body.target_project_id)
    )
    wp.parent_id = None
    wp.milestone_id = None
    wp.cycle_id = None
    wp.module_id = None
    if assignee_cleared:
        wp.assignee_id = None
    wp.project_id = body.target_project_id
    wp.version += 1
    await session.flush()  # WP row moves before attachments re-anchor
    if moved_attachment_ids:
        await session.execute(
            sa_update(Attachment)
            .where(Attachment.id.in_(moved_attachment_ids))
            .values(work_package_id=wp_id, project_id=body.target_project_id)
        )
    session.add(
        Activity(
            work_package_id=wp_id,
            actor_id=user.id,
            action="field_changed",
            field="project",
            old_value=names.get(old_project_id),
            new_value=names.get(body.target_project_id),
        )
    )
    await session.commit()
    fresh = await _reselect_fresh(session, wp_id)
    return WorkPackageMoveResult(
        work_package=WorkPackageRead.model_validate(fresh), cleared=cleared, dry_run=False
    )
