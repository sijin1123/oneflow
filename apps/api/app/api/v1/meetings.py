"""Project meetings — agenda, minutes, action items (follow-up collaboration module).

Member-scoped. Agenda/minutes are sanitized rich-text HTML; meeting edits use the
integer-version optimistic-concurrency contract (§6.2). Action items are a small
child resource with plain CRUD.
"""

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy import update as sa_update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import is_member, require_active_project, require_member
from app.core.authz import is_member as _is_member_check  # noqa: F401 (alias below)
from app.db.session import get_session
from app.models.meeting import Meeting, MeetingActionItem
from app.models.meeting_template import MeetingAgendaTemplate
from app.models.member import ProjectMember
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.meeting import (
    ActionItemCreate,
    ActionItemRead,
    ActionItemUpdate,
    MeetingConflict,
    MeetingCreate,
    MeetingFollowUpCreate,
    MeetingList,
    MeetingListItem,
    MeetingRead,
    MeetingTemplateCreate,
    MeetingTemplateList,
    MeetingTemplateRead,
    MeetingUpdate,
)
from app.services.activity import record_created
from app.services.notification import record_assignment
from app.services.sanitize import sanitize_html

router = APIRouter()

# Advisory-lock classid serializing follow-up creation per source meeting
# (v34.1 R1-\u2460; 427002/427005 precedent).
FOLLOW_UP_LOCK_CLASSID = 427006


async def _get_meeting_scoped(
    session: AsyncSession, meeting_id: uuid.UUID, user: User, *, write: bool = False
) -> Meeting:
    m = (
        await session.execute(select(Meeting).where(Meeting.id == meeting_id))
    ).scalar_one_or_none()
    if m is None or not await is_member(session, m.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")
    if write:
        await require_active_project(session, m.project_id)
    return m


async def _action_items(session: AsyncSession, meeting_id: uuid.UUID) -> list[ActionItemRead]:
    rows = (
        (
            await session.execute(
                select(MeetingActionItem)
                .where(MeetingActionItem.meeting_id == meeting_id)
                .order_by(MeetingActionItem.created_at.asc(), MeetingActionItem.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return [ActionItemRead.model_validate(r) for r in rows]


async def _read(session: AsyncSession, m: Meeting) -> MeetingRead:
    out = MeetingRead.model_validate(m)
    out.action_items = await _action_items(session, m.id)
    return out


@router.get("/projects/{project_id}/meetings", response_model=MeetingList)
async def list_meetings(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MeetingList:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(Meeting)
                .where(Meeting.project_id == project_id)
                .order_by(Meeting.scheduled_on.desc().nullslast(), Meeting.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return MeetingList(items=[MeetingListItem.model_validate(r) for r in rows], total=len(rows))


@router.post("/projects/{project_id}/meetings", response_model=MeetingRead, status_code=201)
async def create_meeting(
    project_id: uuid.UUID,
    body: MeetingCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MeetingRead:
    await require_member(session, project_id, user, write=True)
    agenda = None
    if body.template_id is not None:
        # Same-transaction lookup (v48.1 R1-④): a template deleted mid-flight
        # is a plain 404; the copied agenda is a snapshot — later template
        # changes never touch this meeting.
        template = (
            await session.execute(
                select(MeetingAgendaTemplate).where(
                    MeetingAgendaTemplate.id == body.template_id,
                    MeetingAgendaTemplate.project_id == project_id,
                )
            )
        ).scalar_one_or_none()
        if template is None:
            raise HTTPException(status_code=404, detail="not found")
        agenda = template.agenda
    m = Meeting(
        project_id=project_id,
        title=body.title,
        scheduled_on=body.scheduled_on,
        agenda=agenda,
        author_id=user.id,
    )
    session.add(m)
    await session.flush()
    await session.commit()
    return await _read(session, m)


@router.get("/meetings/{meeting_id}", response_model=MeetingRead)
async def get_meeting(
    meeting_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MeetingRead:
    return await _read(session, await _get_meeting_scoped(session, meeting_id, user))


@router.patch(
    "/meetings/{meeting_id}",
    response_model=MeetingRead,
    responses={409: {"model": MeetingConflict}},
)
async def update_meeting(
    meeting_id: uuid.UUID,
    body: MeetingUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await _get_meeting_scoped(session, meeting_id, user, write=True)

    changes: dict = {}
    provided = body.model_fields_set
    if "title" in provided and body.title is not None:
        changes["title"] = body.title
    if "scheduled_on" in provided:
        changes["scheduled_on"] = body.scheduled_on
    if "agenda" in provided:
        changes["agenda"] = sanitize_html(body.agenda)
    if "minutes" in provided:
        changes["minutes"] = sanitize_html(body.minutes)

    if not changes:
        fresh = await _reselect(session, meeting_id)
        if fresh is None:
            raise HTTPException(status_code=404, detail="not found")
        if fresh.version != body.expected_version:
            return _conflict(await _read(session, fresh))
        return await _read(session, fresh)

    stmt = (
        sa_update(Meeting)
        .where(Meeting.id == meeting_id, Meeting.version == body.expected_version)
        .values(**changes, version=Meeting.version + 1, updated_at=func.now())
        .returning(Meeting)
        .execution_options(synchronize_session=False, populate_existing=True)
    )
    updated = (await session.execute(stmt)).scalar_one_or_none()
    await session.commit()
    if updated is not None:
        return await _read(session, updated)

    fresh = await _reselect(session, meeting_id)
    if fresh is None:
        raise HTTPException(status_code=404, detail="not found")
    return _conflict(await _read(session, fresh))


@router.post("/meetings/{meeting_id}/follow-up", response_model=MeetingRead, status_code=201)
async def create_follow_up(
    meeting_id: uuid.UUID,
    body: MeetingFollowUpCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MeetingRead:
    """Follow-up meeting (Pass 34 PR-AZ): same title (occurrences are told
    apart by date), agenda carried, minutes empty, author = caller. Open
    UNCONVERTED action items are COPIED — converted items are tracked by
    their work package, and the source meeting keeps its full record."""
    src = await _get_meeting_scoped(session, meeting_id, user, write=True)
    # Serialize follow-up creation per source meeting: double-clicks, retries
    # and concurrent users converge on ONE follow-up (v34.1 R1-①).
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, hashtext(:mid))").bindparams(
            classid=FOLLOW_UP_LOCK_CLASSID, mid=str(src.id)
        )
    )
    scheduled = body.scheduled_on
    if scheduled is None and src.scheduled_on is not None:
        scheduled = src.scheduled_on + timedelta(days=7)
    duplicate = (
        await session.execute(
            select(Meeting.id).where(
                Meeting.project_id == src.project_id,
                Meeting.id != src.id,  # an undated source matches itself otherwise
                Meeting.title == src.title,
                # NULL-safe: two undated follow-ups also count as duplicates.
                Meeting.scheduled_on.is_not_distinct_from(scheduled),
            )
        )
    ).first()
    if duplicate is not None:
        raise HTTPException(
            status_code=409, detail="a meeting with that title and date already exists"
        )
    m = Meeting(
        project_id=src.project_id,
        title=src.title,
        scheduled_on=scheduled,
        agenda=src.agenda,  # already sanitized at write time
        author_id=user.id,
    )
    session.add(m)
    await session.flush()
    if body.carry_open_items:
        open_items = (
            (
                await session.execute(
                    select(MeetingActionItem)
                    .where(
                        MeetingActionItem.meeting_id == src.id,
                        MeetingActionItem.done.is_(False),
                        MeetingActionItem.converted_wp_id.is_(None),
                    )
                    .order_by(MeetingActionItem.created_at.asc(), MeetingActionItem.id.asc())
                )
            )
            .scalars()
            .all()
        )
        # A carried item is a NEW assignment: the assignee survives only as a
        # current, ACTIVE project member — otherwise null (v34.1 R1-③,
        # Pass 33 deactivation policy).
        valid_assignees = {
            row
            for row in (
                await session.execute(
                    select(ProjectMember.user_id)
                    .join(User, ProjectMember.user_id == User.id)
                    .where(
                        ProjectMember.project_id == src.project_id,
                        User.is_active.is_(True),
                    )
                )
            ).scalars()
        }
        for item in open_items:
            session.add(
                MeetingActionItem(
                    meeting_id=m.id,
                    description=item.description,
                    assignee_id=item.assignee_id if item.assignee_id in valid_assignees else None,
                    done=False,
                )
            )
    await session.commit()
    return await _read(session, m)


@router.delete("/meetings/{meeting_id}", status_code=204)
async def delete_meeting(
    meeting_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    m = await _get_meeting_scoped(session, meeting_id, user, write=True)
    await session.delete(m)
    await session.commit()
    return Response(status_code=204)


@router.post("/meetings/{meeting_id}/action-items", response_model=ActionItemRead, status_code=201)
async def create_action_item(
    meeting_id: uuid.UUID,
    body: ActionItemCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ActionItemRead:
    m = await _get_meeting_scoped(session, meeting_id, user, write=True)
    if body.assignee_id is not None and not await is_member(
        session, m.project_id, body.assignee_id
    ):
        raise HTTPException(status_code=422, detail="assignee must be a member of the project")
    item = MeetingActionItem(
        meeting_id=meeting_id, description=body.description, assignee_id=body.assignee_id
    )
    session.add(item)
    await session.flush()
    await session.commit()
    return ActionItemRead.model_validate(item)


async def _get_action_item_scoped(
    session: AsyncSession, item_id: uuid.UUID, user: User, *, write: bool = False
) -> MeetingActionItem:
    item = (
        await session.execute(select(MeetingActionItem).where(MeetingActionItem.id == item_id))
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="not found")
    # Membership (and, for writes, the archive gate) via the parent meeting.
    await _get_meeting_scoped(session, item.meeting_id, user, write=write)
    return item


@router.patch("/action-items/{item_id}", response_model=ActionItemRead)
async def update_action_item(
    item_id: uuid.UUID,
    body: ActionItemUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ActionItemRead:
    item = await _get_action_item_scoped(session, item_id, user, write=True)
    item.done = body.done
    await session.commit()
    await session.refresh(item)
    return ActionItemRead.model_validate(item)


@router.delete("/action-items/{item_id}", status_code=204)
async def delete_action_item(
    item_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    item = await _get_action_item_scoped(session, item_id, user, write=True)
    await session.delete(item)
    await session.commit()
    return Response(status_code=204)


async def _reselect(session: AsyncSession, meeting_id: uuid.UUID) -> Meeting | None:
    return (
        await session.execute(
            select(Meeting)
            .where(Meeting.id == meeting_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


def _conflict(current: MeetingRead) -> JSONResponse:
    payload = MeetingConflict(
        detail="version conflict — meeting was modified by someone else", current=current
    )
    return JSONResponse(status_code=409, content=jsonable_encoder(payload))


@router.post("/action-items/{item_id}/convert", response_model=ActionItemRead)
async def convert_action_item(
    item_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ActionItemRead:
    """Turn a meeting action item into a work package (Pass 6 PR-O).

    Intake-accept pattern: WP insert+flush, then a status-conditional UPDATE
    (`converted_wp_id IS NULL`) in the SAME transaction — a concurrent convert
    succeeds exactly once and the loser's WP insert rolls back (409).
    Assignee inheritance: only if the item's assignee is a CURRENT project
    member; otherwise (null / left / deleted) the WP starts unassigned —
    conversion is never refused over a stale assignee."""
    item = await _get_action_item_scoped(session, item_id, user, write=True)
    if item.converted_wp_id is not None:
        raise HTTPException(status_code=409, detail="action item was already converted")
    meeting = (
        await session.execute(select(Meeting).where(Meeting.id == item.meeting_id))
    ).scalar_one()

    assignee = None
    if item.assignee_id is not None and await is_member(
        session, meeting.project_id, item.assignee_id
    ):
        assignee = item.assignee_id

    wp = WorkPackage(
        project_id=meeting.project_id,
        subject=item.description[:255],
        description=f"회의 '{meeting.title}'의 액션 아이템에서 전환됨",
        assignee_id=assignee,
        created_by=user.id,
    )
    session.add(wp)
    await session.flush()
    record_created(session, wp.id, user.id)
    if assignee is not None:
        await record_assignment(
            session,
            recipient_id=assignee,
            actor_id=user.id,
            project_id=meeting.project_id,
            wp_id=wp.id,
        )

    result = await session.execute(
        sa_update(MeetingActionItem)
        .where(MeetingActionItem.id == item_id, MeetingActionItem.converted_wp_id.is_(None))
        .values(converted_wp_id=wp.id, done=True)
    )
    if result.rowcount == 0:
        await session.rollback()  # the WP insert rolls back with the transaction
        raise HTTPException(status_code=409, detail="action item was already converted")
    await session.commit()
    await session.refresh(item)
    return ActionItemRead.model_validate(item)


# --- Agenda templates (Pass 48 PR-BN, v48.1) -----------------------------------


@router.get("/projects/{project_id}/meeting-templates", response_model=MeetingTemplateList)
async def list_meeting_templates(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MeetingTemplateList:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(MeetingAgendaTemplate)
                .where(MeetingAgendaTemplate.project_id == project_id)
                .order_by(MeetingAgendaTemplate.name.asc(), MeetingAgendaTemplate.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return MeetingTemplateList(
        items=[MeetingTemplateRead.model_validate(r) for r in rows], total=len(rows)
    )


@router.post(
    "/projects/{project_id}/meeting-templates",
    response_model=MeetingTemplateRead,
    status_code=201,
)
async def create_meeting_template(
    project_id: uuid.UUID,
    body: MeetingTemplateCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MeetingTemplateRead:
    """agenda XOR from_meeting_id (schema-enforced). A from_meeting snapshot
    copies the ALREADY-sanitized stored agenda; a direct agenda passes the
    same nh3 boundary as meeting edits (v48.1 R1-②)."""
    await require_member(session, project_id, user, write=True)
    if body.from_meeting_id is not None:
        source = (
            await session.execute(
                select(Meeting).where(
                    Meeting.id == body.from_meeting_id, Meeting.project_id == project_id
                )
            )
        ).scalar_one_or_none()
        if source is None:
            raise HTTPException(status_code=404, detail="not found")
        agenda = source.agenda
    else:
        agenda = sanitize_html(body.agenda)
    template = MeetingAgendaTemplate(
        project_id=project_id, name=body.name, agenda=agenda, created_by=user.id
    )
    try:
        session.add(template)
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="a template with that name already exists"
        ) from exc
    return MeetingTemplateRead.model_validate(template)


@router.delete("/meeting-templates/{template_id}", status_code=204)
async def delete_meeting_template(
    template_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    """Author or PROJECT OWNER (the #118 document-comment ruling): order is
    scope 404 → archive 409 → authorship 404 (existence hidden). Deleting a
    template never touches meetings created from it (snapshot copies)."""
    template = (
        await session.execute(
            select(MeetingAgendaTemplate).where(MeetingAgendaTemplate.id == template_id)
        )
    ).scalar_one_or_none()
    if template is None or not await is_member(session, template.project_id, user.id):
        raise HTTPException(status_code=404, detail="not found")
    await require_active_project(session, template.project_id)
    if template.created_by != user.id:
        role = (
            await session.execute(
                select(ProjectMember.role).where(
                    ProjectMember.project_id == template.project_id,
                    ProjectMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if role != "owner":
            raise HTTPException(status_code=404, detail="not found")
    await session.delete(template)
    await session.commit()
    return Response(status_code=204)
