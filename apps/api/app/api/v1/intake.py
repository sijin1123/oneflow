import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import member_role, require_member, require_role
from app.db.session import get_session
from app.models.intake import INTAKE_OPEN_STATUSES, IntakeItem
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.intake import IntakeCreate, IntakeList, IntakeRead, IntakeTriage
from app.services.activity import record_created
from app.services.notification import record_intake_triage
from app.services.sanitize import sanitize_html

router = APIRouter()

# Visibility: owners triage everything; plain members see their OWN submissions
# only (the queue may hold other members' half-formed requests).


def _to_read(row: IntakeItem, submitter_name: str | None) -> IntakeRead:
    return IntakeRead(
        id=row.id,
        project_id=row.project_id,
        title=row.title,
        body=row.body,
        status=row.status,
        submitted_by=row.submitted_by,
        submitter_name=submitter_name,
        snooze_until=row.snooze_until,
        accepted_wp_id=row.accepted_wp_id,
        triage_note=row.triage_note,
        triaged_by_id=row.triaged_by,
        triaged_at=row.triaged_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/projects/{project_id}/intake", response_model=IntakeList)
async def list_intake(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> IntakeList:
    await require_member(session, project_id, user)
    role = await member_role(session, project_id, user.id)
    stmt = (
        select(IntakeItem, User.display_name)
        .outerjoin(User, IntakeItem.submitted_by == User.id)
        .where(IntakeItem.project_id == project_id)
        .order_by(IntakeItem.created_at.desc(), IntakeItem.id.desc())
    )
    if role != "owner":
        stmt = stmt.where(IntakeItem.submitted_by == user.id)
    rows = (await session.execute(stmt)).all()
    return IntakeList(items=[_to_read(r, name) for (r, name) in rows], total=len(rows))


@router.post("/projects/{project_id}/intake", response_model=IntakeRead, status_code=201)
async def submit_intake(
    project_id: uuid.UUID,
    body: IntakeCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> IntakeRead:
    await require_member(session, project_id, user, write=True)
    row = IntakeItem(
        project_id=project_id,
        title=body.title,
        body=sanitize_html(body.body) if body.body else None,
        submitted_by=user.id,
    )
    session.add(row)
    await session.commit()
    return _to_read(row, user.display_name)


@router.post(
    "/projects/{project_id}/intake/{item_id}/triage",
    response_model=IntakeRead,
)
async def triage_intake(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    body: IntakeTriage,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> IntakeRead:
    """Owner decision on an OPEN (pending/snoozed) item.

    Accept order inside ONE transaction: ① insert the work package (flushed for
    its id) → ② status-conditional UPDATE — rowcount 0 means someone else
    already decided, so the whole transaction (including the WP) rolls back and
    the caller gets 409. A concurrent accept therefore succeeds exactly once
    and can never leave a duplicate work package (PLAN P2-5)."""
    await require_role(session, project_id, user, {"owner"}, write=True)
    item = (
        await session.execute(select(IntakeItem).where(IntakeItem.id == item_id))
    ).scalar_one_or_none()
    if item is None or item.project_id != project_id:
        raise HTTPException(status_code=404, detail="not found")

    accepted_wp_id: uuid.UUID | None = None
    if body.status == "accepted":
        wp = WorkPackage(
            project_id=project_id,
            subject=item.title,
            description=item.body,
            created_by=user.id,
        )
        session.add(wp)
        await session.flush()  # id for the conditional UPDATE + activity FK
        record_created(session, wp.id, user.id)
        accepted_wp_id = wp.id

    # Final-decision metadata: the note is ALWAYS replaced (null when omitted)
    # so a snooze reason never lingers on the final decision (v29.1 R1-⑥).
    values: dict = {
        "status": body.status,
        "triage_note": body.note,
        "triaged_by": user.id,
        "triaged_at": func.now(),
    }
    if body.status == "accepted":
        values["accepted_wp_id"] = accepted_wp_id
    if body.status == "snoozed":
        values["snooze_until"] = body.snooze_until
    result = await session.execute(
        sa_update(IntakeItem)
        .where(IntakeItem.id == item_id, IntakeItem.status.in_(INTAKE_OPEN_STATUSES))
        .values(**values)
    )
    if result.rowcount == 0:
        # Already decided by a concurrent triage — roll back everything,
        # including the just-inserted work package.
        await session.rollback()
        raise HTTPException(status_code=409, detail="item was already triaged")
    # Notify the submitter of a FINAL verdict only (Pass 49, v49.1 R1-③ —
    # after the conditional UPDATE succeeded, inside the same transaction, so
    # a concurrent triage can never leave an orphan or duplicate notification;
    # snoozed is an interim state and stays silent).
    if body.status in ("accepted", "declined", "duplicate"):
        await record_intake_triage(
            session, item=item, actor_id=user.id, accepted_wp_id=accepted_wp_id
        )
    await session.commit()
    await session.refresh(item)
    name = (
        await session.execute(select(User.display_name).where(User.id == item.submitted_by))
    ).scalar_one_or_none()
    return _to_read(item, name)
