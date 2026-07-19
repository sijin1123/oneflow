import re
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.project_types import require_type_enabled
from app.api.v1.work_packages import require_wp_member
from app.core.auth import get_current_user
from app.core.authz import require_member, require_permission
from app.db.session import get_session
from app.models.custom_field import CustomField, WpCustomValue
from app.models.member import ProjectMember
from app.models.user import User
from app.schemas.custom_field import (
    CustomFieldCreate,
    CustomFieldList,
    CustomFieldRead,
    CustomFieldReorder,
    CustomFieldUpdate,
    CustomValueList,
    CustomValueRead,
    CustomValuesPut,
)

router = APIRouter()


async def _require_active_bindings(
    session: AsyncSession, project_id: uuid.UUID, applies_to: list[str] | None
) -> None:
    for type_key in applies_to or []:
        await require_type_enabled(session, project_id, type_key)


MAX_TEXT_LEN = 2000
MAX_URL_LEN = 2000
_URL_RE = re.compile(r"^https?://", re.IGNORECASE)


def _read(f: CustomField) -> CustomFieldRead:
    return CustomFieldRead(
        id=f.id,
        project_id=f.project_id,
        name=f.name,
        field_type=f.field_type,
        options=f.options,
        position=f.position,
        is_active=f.is_active,
        applies_to=f.applies_to,
        created_at=f.created_at,
        updated_at=f.updated_at,
    )


@router.get("/projects/{project_id}/custom-fields", response_model=CustomFieldList)
async def list_custom_fields(
    project_id: uuid.UUID,
    include_inactive: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomFieldList:
    await require_member(session, project_id, user)
    stmt = select(CustomField).where(CustomField.project_id == project_id)
    if not include_inactive:
        stmt = stmt.where(CustomField.is_active.is_(True))
    rows = (
        (
            await session.execute(
                stmt.order_by(CustomField.position, CustomField.created_at, CustomField.id)
            )
        )
        .scalars()
        .all()
    )
    return CustomFieldList(items=[_read(f) for f in rows], total=len(rows))


@router.post(
    "/projects/{project_id}/custom-fields", response_model=CustomFieldRead, status_code=201
)
async def create_custom_field(
    project_id: uuid.UUID,
    body: CustomFieldCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomFieldRead:
    await require_permission(session, project_id, user, "field.manage", write=True)
    await _require_active_bindings(session, project_id, body.applies_to)
    # Deterministic append position in the same transaction; a concurrent-create
    # tie is tolerated — ordering stays stable via (position, created_at, id).
    next_pos = (
        await session.execute(
            select(func.coalesce(func.max(CustomField.position) + 1, 0)).where(
                CustomField.project_id == project_id
            )
        )
    ).scalar_one()
    f = CustomField(
        project_id=project_id,
        name=body.name,
        field_type=body.field_type,
        options=body.options,
        applies_to=body.applies_to,
        position=next_pos,
    )
    try:
        session.add(f)
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="a field with that name already exists"
        ) from exc
    return _read(f)


async def _get_scoped(
    session: AsyncSession, project_id: uuid.UUID, field_id: uuid.UUID
) -> CustomField:
    f = (
        await session.execute(select(CustomField).where(CustomField.id == field_id))
    ).scalar_one_or_none()
    if f is None or f.project_id != project_id:
        raise HTTPException(status_code=404, detail="not found")
    return f


@router.patch("/projects/{project_id}/custom-fields/{field_id}", response_model=CustomFieldRead)
async def update_custom_field(
    project_id: uuid.UUID,
    field_id: uuid.UUID,
    body: CustomFieldUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomFieldRead:
    await require_permission(session, project_id, user, "field.manage", write=True)
    f = await _get_scoped(session, project_id, field_id)
    fields = body.model_dump(exclude_unset=True)
    if fields.get("applies_to") is not None:
        await _require_active_bindings(session, project_id, fields["applies_to"])
    for key in ("name", "is_active"):
        if key in fields and fields[key] is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
    if "options" in fields and f.field_type != "dropdown":
        raise HTTPException(status_code=422, detail="options are only allowed for dropdown fields")
    try:
        for key, value in fields.items():
            setattr(f, key, value)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="a field with that name already exists"
        ) from exc
    await session.refresh(f)  # onupdate updated_at is server-computed
    return _read(f)


@router.delete("/projects/{project_id}/custom-fields/{field_id}", status_code=204)
async def delete_custom_field(
    project_id: uuid.UUID,
    field_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    """Hard delete only when no values reference the field — enforced by the
    RESTRICT FK, so a concurrent value write makes THIS delete fail (409),
    never the other way around. Operational removal is is_active=false."""
    await require_permission(session, project_id, user, "field.manage", write=True)
    f = await _get_scoped(session, project_id, field_id)
    try:
        await session.delete(f)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        count = (
            await session.execute(
                select(func.count())
                .select_from(WpCustomValue)
                .where(WpCustomValue.field_id == field_id)
            )
        ).scalar_one()
        raise HTTPException(
            status_code=409,
            detail=f"field still has {count} stored values — deactivate it instead",
        ) from exc
    return Response(status_code=204)


def _validate_value(f: CustomField, value: object, member_ids: set[uuid.UUID]) -> object:
    """Single write fan-in for value typing. Returns the normalized value."""

    def bad(msg: str) -> HTTPException:
        return HTTPException(status_code=422, detail=f"field '{f.name}': {msg}")

    if f.field_type == "text":
        if not isinstance(value, str):
            raise bad("expected a string")
        value = value.strip()
        if not value or len(value) > MAX_TEXT_LEN:
            raise bad(f"text must be 1-{MAX_TEXT_LEN} chars after trim")
        return value
    if f.field_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise bad("expected a number")
        if not (float("-inf") < float(value) < float("inf")) or float(value) != float(value):
            raise bad("number must be finite")
        return value
    if f.field_type == "boolean":
        if not isinstance(value, bool):
            raise bad("expected true or false")
        return value
    if f.field_type == "date":
        if not isinstance(value, str):
            raise bad("expected an ISO date string")
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise bad("expected an ISO date string") from exc
        return value
    if f.field_type == "dropdown":
        # Validation against CURRENT options at write time only; orphan values
        # from removed options stay stored and readable.
        if not isinstance(value, str) or value not in (f.options or []):
            raise bad("value must be one of the field's options")
        return value
    if f.field_type == "member":
        if not isinstance(value, str):
            raise bad("expected a member id")
        try:
            member_id = uuid.UUID(value)
        except ValueError as exc:
            raise bad("expected a member id") from exc
        if member_id not in member_ids:
            raise bad("value must be a current project member")
        return str(member_id)
    if f.field_type == "url":
        if not isinstance(value, str):
            raise bad("expected a URL string")
        value = value.strip()
        if not _URL_RE.match(value) or len(value) > MAX_URL_LEN:
            raise bad("expected an http(s) URL")
        return value
    raise bad("unsupported field type")  # unreachable — CHECK constraint


@router.get("/work-packages/{wp_id}/custom-values", response_model=CustomValueList)
async def list_custom_values(
    wp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomValueList:
    await require_wp_member(session, wp_id, user)
    rows = (
        await session.execute(
            select(WpCustomValue, CustomField.field_type)
            .join(CustomField, WpCustomValue.field_id == CustomField.id)
            .where(WpCustomValue.work_package_id == wp_id)
        )
    ).all()
    # Member display names resolve in a second tiny query (a JSONB→uuid join
    # buys nothing at this row count); deleted users render as a fixed label.
    member_ids: set[uuid.UUID] = set()
    for v, ftype in rows:
        if ftype == "member":
            member_ids.add(uuid.UUID(v.value))
    names: dict[uuid.UUID, str] = {}
    if member_ids:
        for uid, name in (
            await session.execute(select(User.id, User.display_name).where(User.id.in_(member_ids)))
        ).all():
            names[uid] = name
    items = [
        CustomValueRead(
            field_id=v.field_id,
            value=v.value,
            member_display_name=(
                names.get(uuid.UUID(v.value), "(삭제된 사용자)") if ftype == "member" else None
            ),
        )
        for (v, ftype) in rows
    ]
    return CustomValueList(items=items, total=len(items))


@router.put("/work-packages/{wp_id}/custom-values", response_model=CustomValueList)
async def put_custom_values(
    wp_id: uuid.UUID,
    body: CustomValuesPut,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomValueList:
    """DELTA upsert in ONE transaction (all-or-nothing): only the listed
    field_ids change; value=null deletes. Conflicts resolve per-field via
    ON CONFLICT DO UPDATE — no read-modify-write race."""
    wp = await require_wp_member(session, wp_id, user, write=True)

    field_ids = [w.field_id for w in body.values]
    if len(set(field_ids)) != len(field_ids):
        raise HTTPException(status_code=422, detail="duplicate field_id in payload")
    fields = {
        f.id: f
        for f in (await session.execute(select(CustomField).where(CustomField.id.in_(field_ids))))
        .scalars()
        .all()
    }
    member_ids: set[uuid.UUID] = set(
        (
            await session.execute(
                select(ProjectMember.user_id).where(ProjectMember.project_id == wp.project_id)
            )
        ).scalars()
    )

    for w in body.values:
        f = fields.get(w.field_id)
        if f is None or f.project_id != wp.project_id:
            raise HTTPException(status_code=422, detail="field must belong to the same project")
        if w.value is None:
            await session.execute(
                WpCustomValue.__table__.delete().where(
                    WpCustomValue.work_package_id == wp_id,
                    WpCustomValue.field_id == w.field_id,
                )
            )
            continue
        if not f.is_active:
            raise HTTPException(
                status_code=422,
                detail=f"field '{f.name}' is inactive — values can only be cleared",
            )
        if f.applies_to is not None and wp.type not in f.applies_to:
            # Binding shapes the form: NEW values only for bound types; values
            # stored before a type change stay readable and clearable.
            raise HTTPException(
                status_code=422,
                detail=f"field '{f.name}' does not apply to type '{wp.type}'",
            )
        normalized = _validate_value(f, w.value, member_ids)
        await session.execute(
            pg_insert(WpCustomValue)
            .values(
                id=uuid.uuid4(),
                work_package_id=wp_id,
                field_id=w.field_id,
                value=normalized,
            )
            .on_conflict_do_update(
                constraint="uq_wp_custom_values_wp_field",
                set_={"value": normalized, "updated_at": func.now()},
            )
        )
    await session.commit()
    return await list_custom_values(wp_id, session, user)


@router.put("/projects/{project_id}/custom-fields/order", response_model=CustomFieldList)
async def reorder_custom_fields(
    project_id: uuid.UUID,
    body: CustomFieldReorder,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomFieldList:
    """Capability-gated atomic reorder (Pass 50 — the statuses /order contract
    verbatim): ordered_ids must list EXACTLY this project's fields (active
    and inactive); positions rewrite 0..n-1 in one transaction."""
    await require_permission(session, project_id, user, "field.manage", write=True)
    rows = (
        (await session.execute(select(CustomField).where(CustomField.project_id == project_id)))
        .scalars()
        .all()
    )
    by_id = {r.id: r for r in rows}
    if set(body.ordered_ids) != set(by_id):
        raise HTTPException(
            status_code=422, detail="ordered_ids must list exactly this project's fields"
        )
    for position, field_id in enumerate(body.ordered_ids):
        by_id[field_id].position = position
    await session.commit()
    # Re-select async: the UPDATE expired onupdate columns (updated_at) and a
    # sync lazy-load here would MissingGreenlet (the house gotcha).
    ordered = (
        (
            await session.execute(
                select(CustomField)
                .where(CustomField.project_id == project_id)
                .order_by(CustomField.position.asc(), CustomField.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return CustomFieldList(items=[_read(r) for r in ordered], total=len(ordered))
