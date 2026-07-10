"""Owner-only personal notes with conflict-safe editing and ordering."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.personal_note import PersonalNote
from app.models.user import User
from app.schemas.personal_note import (
    PersonalNoteConflict,
    PersonalNoteCreate,
    PersonalNoteError,
    PersonalNoteList,
    PersonalNoteOrder,
    PersonalNoteRead,
    PersonalNoteUpdate,
)

router = APIRouter()

PERSONAL_NOTE_LIMIT = 200
PERSONAL_NOTE_LOCK_CLASSID = 427012


async def _lock_user_notes(session: AsyncSession, user_id: uuid.UUID) -> None:
    # The same bounded wait used by other ordering/quota surfaces.  PostgreSQL
    # releases this xact lock automatically on commit/rollback.
    try:
        await session.execute(text("SET LOCAL lock_timeout = '5s'"))
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:classid, hashtext(:uid))").bindparams(
                classid=PERSONAL_NOTE_LOCK_CLASSID, uid=str(user_id)
            )
        )
    except DBAPIError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "55P03":
            raise HTTPException(
                status_code=503, detail="personal notes busy - retry shortly"
            ) from exc
        raise


def _read(note: PersonalNote) -> PersonalNoteRead:
    return PersonalNoteRead.model_validate(note)


async def _own_or_404(
    session: AsyncSession, note_id: uuid.UUID, user_id: uuid.UUID
) -> PersonalNote:
    note = (
        await session.execute(
            select(PersonalNote).where(PersonalNote.id == note_id, PersonalNote.user_id == user_id)
        )
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="not found")
    return note


async def _conflict_or_404(
    session: AsyncSession, note_id: uuid.UUID, user_id: uuid.UUID
) -> JSONResponse:
    current = await _own_or_404(session, note_id, user_id)
    payload = PersonalNoteConflict(
        detail="note was changed elsewhere",
        current=_read(current),
    )
    return JSONResponse(status_code=409, content=jsonable_encoder(payload))


@router.get("/me/personal-notes", response_model=PersonalNoteList)
async def list_personal_notes(
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PersonalNoteList:
    stmt = select(PersonalNote).where(PersonalNote.user_id == user.id)
    if q and q.strip():
        stmt = stmt.where(PersonalNote.title.ilike(f"%{q.strip()}%"))
    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        (
            await session.execute(
                stmt.order_by(
                    PersonalNote.is_pinned.desc(),
                    PersonalNote.position.asc(),
                    PersonalNote.id.asc(),
                )
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return PersonalNoteList(
        items=[_read(note) for note in rows], total=total, limit=limit, offset=offset
    )


@router.post(
    "/me/personal-notes",
    response_model=PersonalNoteRead,
    status_code=201,
    responses={409: {"model": PersonalNoteError}, 503: {"model": PersonalNoteError}},
)
async def create_personal_note(
    body: PersonalNoteCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PersonalNoteRead:
    await _lock_user_notes(session, user.id)
    count = (
        await session.execute(select(func.count()).where(PersonalNote.user_id == user.id))
    ).scalar_one()
    if count >= PERSONAL_NOTE_LIMIT:
        raise HTTPException(status_code=409, detail="personal note limit (200) reached")
    next_position = (
        await session.execute(
            select(func.coalesce(func.max(PersonalNote.position), -1) + 1).where(
                PersonalNote.user_id == user.id, PersonalNote.is_pinned == body.is_pinned
            )
        )
    ).scalar_one()
    note = PersonalNote(
        user_id=user.id,
        title=body.title,
        body=body.body,
        is_pinned=body.is_pinned,
        position=next_position,
    )
    session.add(note)
    await session.flush()
    await session.commit()
    await session.refresh(note)
    return _read(note)


@router.patch(
    "/me/personal-notes/{note_id}",
    response_model=PersonalNoteRead,
    responses={
        409: {"model": PersonalNoteConflict},
        503: {"model": PersonalNoteError},
    },
)
async def update_personal_note(
    note_id: uuid.UUID,
    body: PersonalNoteUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PersonalNoteRead | JSONResponse:
    await _lock_user_notes(session, user.id)
    current = await _own_or_404(session, note_id, user.id)
    values = body.model_dump(exclude_unset=True, exclude={"expected_version"})
    if not values:
        return _read(current)
    if "is_pinned" in values and values["is_pinned"] != current.is_pinned:
        values["position"] = (
            await session.execute(
                select(func.coalesce(func.max(PersonalNote.position), -1) + 1).where(
                    PersonalNote.user_id == user.id,
                    PersonalNote.is_pinned == values["is_pinned"],
                )
            )
        ).scalar_one()
    values["version"] = PersonalNote.version + 1
    values["updated_at"] = func.now()
    result = await session.execute(
        update(PersonalNote)
        .where(
            PersonalNote.id == note_id,
            PersonalNote.user_id == user.id,
            PersonalNote.version == body.expected_version,
        )
        .values(**values)
        .returning(PersonalNote)
    )
    note = result.scalar_one_or_none()
    if note is None:
        return await _conflict_or_404(session, note_id, user.id)
    await session.commit()
    return _read(note)


@router.put(
    "/me/personal-notes/order",
    response_model=PersonalNoteList,
    responses={
        409: {"model": PersonalNoteConflict},
        503: {"model": PersonalNoteError},
    },
)
async def order_personal_notes(
    body: PersonalNoteOrder,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PersonalNoteList | JSONResponse:
    await _lock_user_notes(session, user.id)
    rows = (
        (await session.execute(select(PersonalNote).where(PersonalNote.user_id == user.id)))
        .scalars()
        .all()
    )
    by_id = {note.id: note for note in rows}
    requested_ids = [item.id for item in body.items]
    if len(requested_ids) != len(set(requested_ids)) or set(requested_ids) != set(by_id):
        raise HTTPException(
            status_code=422, detail="items must list exactly all of your notes once"
        )
    seen_unpinned = False
    for item in body.items:
        note = by_id[item.id]
        if not note.is_pinned:
            seen_unpinned = True
        elif seen_unpinned:
            raise HTTPException(status_code=422, detail="pinned notes must precede unpinned notes")
        if note.version != item.expected_version:
            payload = PersonalNoteConflict(
                detail="note was changed elsewhere",
                current=_read(note),
            )
            return JSONResponse(status_code=409, content=jsonable_encoder(payload))
    # Normalize each group to a dense zero-based order. Versions change because
    # this is a write to the ordering state represented by each note.
    positions = {True: 0, False: 0}
    for item in body.items:
        note = by_id[item.id]
        note.position = positions[note.is_pinned]
        note.version += 1
        positions[note.is_pinned] += 1
    await session.flush()
    ordered = (
        (
            await session.execute(
                select(PersonalNote)
                .where(PersonalNote.user_id == user.id)
                .order_by(
                    PersonalNote.is_pinned.desc(),
                    PersonalNote.position.asc(),
                    PersonalNote.id.asc(),
                )
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    payload = PersonalNoteList(
        items=[_read(note) for note in ordered],
        total=len(ordered),
        limit=PERSONAL_NOTE_LIMIT,
        offset=0,
    )
    await session.commit()
    return payload


@router.delete(
    "/me/personal-notes/{note_id}",
    status_code=204,
    response_model=None,
    responses={
        409: {"model": PersonalNoteConflict},
        503: {"model": PersonalNoteError},
    },
)
async def delete_personal_note(
    note_id: uuid.UUID,
    expected_version: int = Query(ge=0, le=2_147_483_647),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response | JSONResponse:
    await _lock_user_notes(session, user.id)
    await _own_or_404(session, note_id, user.id)
    result = await session.execute(
        PersonalNote.__table__.delete().where(
            PersonalNote.id == note_id,
            PersonalNote.user_id == user.id,
            PersonalNote.version == expected_version,
        )
    )
    if result.rowcount != 1:
        return await _conflict_or_404(session, note_id, user.id)
    await session.commit()
    return Response(status_code=204)
