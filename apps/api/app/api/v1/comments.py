import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy import and_, func, or_, select
from sqlalchemy import delete as sa_delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.work_packages import require_wp_member
from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.activity import ACTIVITY_ACTIONS, Activity
from app.models.comment import LEGACY_REACTION_KEYS, CommentReaction, WorkPackageComment
from app.models.user import User
from app.schemas.comment import (
    ActivityList,
    ActivityRead,
    CommentCreate,
    CommentList,
    CommentRead,
    CommentThreadList,
    CommentThreadRead,
    ReactionAgg,
    ReactionList,
    empty_reactions,
)
from app.services.activity import capture_actor_identity, comment_author_fields, record_comment
from app.services.emoji import is_single_emoji, normalize_emoji
from app.services.notification import notify_mentions, notify_watchers

router = APIRouter()


def _validate_cursor(
    cursor_created_at: datetime | None, cursor_id: uuid.UUID | None, offset: int = 0
) -> None:
    if (cursor_created_at is None) != (cursor_id is None):
        raise HTTPException(
            status_code=422, detail="cursor_created_at and cursor_id must be provided together"
        )
    if cursor_created_at is not None and offset:
        raise HTTPException(status_code=422, detail="cursor and offset cannot be combined")


def _after_cursor(model, created_at: datetime, row_id: uuid.UUID, order: str):
    if order == "asc":
        return or_(
            model.created_at > created_at,
            and_(model.created_at == created_at, model.id > row_id),
        )
    return or_(
        model.created_at < created_at,
        and_(model.created_at == created_at, model.id < row_id),
    )


@router.get("/work-packages/{wp_id}/comments", response_model=CommentList)
async def list_comments(
    wp_id: uuid.UUID,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CommentList:
    await require_wp_member(session, wp_id, user)
    base = select(WorkPackageComment).where(WorkPackageComment.work_package_id == wp_id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        (
            await session.execute(
                base.order_by(WorkPackageComment.created_at.asc()).limit(limit).offset(offset)
            )
        )
        .scalars()
        .all()
    )
    items = [CommentRead.model_validate(c) for c in rows]
    aggs = await _reaction_aggregates(session, [c.id for c in rows], user.id)
    for item in items:
        item.reactions = aggs[item.id]
    return CommentList(items=items, total=total)


@router.get("/work-packages/{wp_id}/comment-threads", response_model=CommentThreadList)
async def list_comment_threads(
    wp_id: uuid.UUID,
    limit: int = Query(default=20, ge=1, le=100),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
    cursor_created_at: datetime | None = Query(default=None),
    cursor_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CommentThreadList:
    """Page root comments while always returning every reply for each root.

    A flat comment cursor can split a conversation across pages. This endpoint
    keeps a root and its single-level replies atomic, while the legacy flat
    endpoint remains available for existing clients.
    """
    await require_wp_member(session, wp_id, user)
    _validate_cursor(cursor_created_at, cursor_id)

    roots = select(WorkPackageComment).where(
        WorkPackageComment.work_package_id == wp_id,
        WorkPackageComment.parent_id.is_(None),
    )
    total_threads = (
        await session.execute(select(func.count()).select_from(roots.subquery()))
    ).scalar_one()
    total_comments = (
        await session.execute(
            select(func.count())
            .select_from(WorkPackageComment)
            .where(WorkPackageComment.work_package_id == wp_id)
        )
    ).scalar_one()
    if cursor_created_at is not None and cursor_id is not None:
        roots = roots.where(_after_cursor(WorkPackageComment, cursor_created_at, cursor_id, order))
    order_columns = (
        (WorkPackageComment.created_at.asc(), WorkPackageComment.id.asc())
        if order == "asc"
        else (WorkPackageComment.created_at.desc(), WorkPackageComment.id.desc())
    )
    root_rows = (
        (await session.execute(roots.order_by(*order_columns).limit(limit + 1))).scalars().all()
    )
    has_more = len(root_rows) > limit
    root_rows = root_rows[:limit]
    root_ids = [comment.id for comment in root_rows]
    reply_rows = []
    if root_ids:
        reply_rows = (
            (
                await session.execute(
                    select(WorkPackageComment)
                    .where(WorkPackageComment.parent_id.in_(root_ids))
                    .order_by(WorkPackageComment.created_at.asc(), WorkPackageComment.id.asc())
                )
            )
            .scalars()
            .all()
        )

    all_rows = [*root_rows, *reply_rows]
    aggs = await _reaction_aggregates(session, [comment.id for comment in all_rows], user.id)
    replies_by_root: dict[uuid.UUID, list[CommentRead]] = {root_id: [] for root_id in root_ids}
    for reply in reply_rows:
        item = CommentRead.model_validate(reply)
        item.reactions = aggs[item.id]
        if reply.parent_id is not None:
            replies_by_root[reply.parent_id].append(item)

    items: list[CommentThreadRead] = []
    for root in root_rows:
        item = CommentRead.model_validate(root)
        item.reactions = aggs[item.id]
        items.append(CommentThreadRead(root=item, replies=replies_by_root[root.id]))

    cursor_root = root_rows[-1] if has_more else None
    return CommentThreadList(
        items=items,
        total_threads=total_threads,
        total_comments=total_comments,
        next_cursor_created_at=cursor_root.created_at if cursor_root else None,
        next_cursor_id=cursor_root.id if cursor_root else None,
    )


@router.post("/work-packages/{wp_id}/comments", response_model=CommentRead, status_code=201)
async def create_comment(
    wp_id: uuid.UUID,
    body: CommentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CommentRead:
    wp = await require_wp_member(session, wp_id, user, write=True)
    if body.parent_id is not None:
        # Single entry point for the single-level invariant (PLAN v10.1 R1-④):
        # the parent must be a ROOT comment on THIS work package.
        parent = (
            await session.execute(
                select(WorkPackageComment).where(WorkPackageComment.id == body.parent_id)
            )
        ).scalar_one_or_none()
        if parent is None or parent.work_package_id != wp_id:
            raise HTTPException(
                status_code=422, detail="parent comment must exist on the same work package"
            )
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail="replies to replies are not allowed")
    actor_snapshot = await capture_actor_identity(session, user.id)
    comment = WorkPackageComment(
        work_package_id=wp_id,
        parent_id=body.parent_id,
        author_id=user.id,
        body=body.body,
        **comment_author_fields(actor_snapshot),
    )
    session.add(comment)
    await record_comment(session, wp_id, user.id)  # same transaction as the comment
    # Notification order (PLAN v10.1 R1-①): watchers first — the RETURNING set
    # feeds the mention exclude, so nobody is notified twice for one comment.
    watch_notified = await notify_watchers(
        session, wp_id=wp_id, project_id=wp.project_id, actor_id=user.id, kind="watch_comment"
    )
    accepted = await notify_mentions(
        session,
        wp_id=wp_id,
        project_id=wp.project_id,
        actor_id=user.id,
        candidate_ids=body.mentioned_user_ids,
        exclude=watch_notified,
    )
    comment.mentions = [str(uid) for uid in accepted] or None
    await session.flush()
    await session.commit()
    # The mentions assignment flushes as an UPDATE, expiring the onupdate
    # updated_at — refresh before validating (MissingGreenlet trap, PR #76).
    await session.refresh(comment)
    created = CommentRead.model_validate(comment)
    created.reactions = empty_reactions()
    return created


async def _reaction_aggregates(
    session: AsyncSession, comment_ids: list[uuid.UUID], user_id: uuid.UUID
) -> dict[uuid.UUID, list[ReactionAgg]]:
    """One batched query for the RETURNED comments only (no N+1); every comment
    gets all six vocabulary slots in fixed order (v17.1 R1-④)."""
    out: dict[uuid.UUID, list[ReactionAgg]] = {cid: empty_reactions() for cid in comment_ids}
    if not comment_ids:
        return out
    rows = (
        await session.execute(
            select(
                CommentReaction.comment_id,
                CommentReaction.emoji,
                func.count().label("count"),
                func.bool_or(CommentReaction.user_id == user_id).label("me"),
            )
            .where(CommentReaction.comment_id.in_(comment_ids))
            .group_by(CommentReaction.comment_id, CommentReaction.emoji)
        )
    ).all()
    for comment_id, emoji, count, me in rows:
        out[comment_id].append(ReactionAgg(key=emoji, count=count, me=bool(me)))
    for aggs in out.values():
        # Deterministic, collation-independent: count desc, codepoint asc
        # (v35.1 R1-⑥ — Python str comparison is codepoint-based).
        aggs.sort(key=lambda a: (-a.count, a.key))
    return out


def _normalize_reaction(emoji: str) -> str:
    """Wire value → stored glyph. Legacy Pass-17 keys normalize forever
    (v35.1 R1-④); everything else must be exactly one emoji grapheme."""
    if emoji in LEGACY_REACTION_KEYS:
        return LEGACY_REACTION_KEYS[emoji]
    normalized = normalize_emoji(emoji)
    if not is_single_emoji(normalized):
        raise HTTPException(status_code=422, detail="emoji must be a single emoji character")
    return normalized


async def _get_comment_scoped(
    session: AsyncSession, comment_id: uuid.UUID, user: User, *, write: bool = False
) -> WorkPackageComment:
    comment = (
        await session.execute(select(WorkPackageComment).where(WorkPackageComment.id == comment_id))
    ).scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=404, detail="not found")
    await require_wp_member(session, comment.work_package_id, user, write=write)
    return comment


@router.put("/comments/{comment_id}/reactions/{emoji}", response_model=ReactionList)
async def put_reaction(
    comment_id: uuid.UUID,
    emoji: str = Path(min_length=1, max_length=64),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ReactionList:
    """Idempotent add (v17.1 R1-①): INSERT..ON CONFLICT DO NOTHING — concurrent
    PUTs both succeed; a comment deleted mid-flight maps to 404 (R1-②)."""
    emoji = _normalize_reaction(emoji)
    comment = await _get_comment_scoped(session, comment_id, user, write=True)
    try:
        await session.execute(
            pg_insert(CommentReaction)
            .values(id=uuid.uuid4(), comment_id=comment.id, user_id=user.id, emoji=emoji)
            .on_conflict_do_nothing(constraint="uq_reactions_comment_user_emoji")
        )
        await session.commit()
    except IntegrityError as exc:  # comment deleted between the check and the insert
        await session.rollback()
        raise HTTPException(status_code=404, detail="not found") from exc
    aggs = await _reaction_aggregates(session, [comment_id], user.id)
    return ReactionList(items=aggs[comment_id])


@router.delete("/comments/{comment_id}/reactions/{emoji}", status_code=204)
async def delete_reaction(
    comment_id: uuid.UUID,
    emoji: str = Path(min_length=1, max_length=64),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    """Idempotent remove — a conditional DELETE whose rowcount is ignored."""
    emoji = _normalize_reaction(emoji)
    await _get_comment_scoped(session, comment_id, user, write=True)
    await session.execute(
        sa_delete(CommentReaction).where(
            CommentReaction.comment_id == comment_id,
            CommentReaction.user_id == user.id,
            CommentReaction.emoji == emoji,
        )
    )
    await session.commit()
    return Response(status_code=204)


@router.get("/work-packages/{wp_id}/activities", response_model=ActivityList)
async def list_activities(
    wp_id: uuid.UUID,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None),
    field: str | None = Query(default=None, max_length=40),
    field_not: str | None = Query(default=None, max_length=40),
    actor_id: uuid.UUID | None = Query(default=None),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
    cursor_created_at: datetime | None = Query(default=None),
    cursor_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ActivityList:
    """Filters compose as independent ANDs (v19.1): `field` is an exact
    internal key match (trimmed, ≤40) — combining it with action=created or
    commented legitimately yields an empty page, never a 422."""
    await require_wp_member(session, wp_id, user)
    _validate_cursor(cursor_created_at, cursor_id, offset)
    if action is not None and action not in ACTIVITY_ACTIONS:
        raise HTTPException(status_code=422, detail=f"action must be one of {ACTIVITY_ACTIONS}")
    base = select(Activity).where(Activity.work_package_id == wp_id)
    if action is not None:
        base = base.where(Activity.action == action)
    if field is not None:
        base = base.where(Activity.field == field.strip())
    if field_not is not None:
        excluded = field_not.strip()
        base = base.where(or_(Activity.field.is_(None), Activity.field != excluded))
    if actor_id is not None:
        # Same independent-AND contract (Pass 38); rows with a null actor
        # never match a concrete id.
        base = base.where(Activity.actor_id == actor_id)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    if cursor_created_at is not None and cursor_id is not None:
        base = base.where(_after_cursor(Activity, cursor_created_at, cursor_id, order))
    order_columns = (
        (Activity.created_at.asc(), Activity.id.asc())
        if order == "asc"
        else (Activity.created_at.desc(), Activity.id.desc())
    )
    rows = (
        (await session.execute(base.order_by(*order_columns).limit(limit + 1).offset(offset)))
        .scalars()
        .all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    cursor_row = rows[-1] if has_more else None
    return ActivityList(
        items=[ActivityRead.model_validate(a) for a in rows],
        total=total,
        next_cursor_created_at=cursor_row.created_at if cursor_row else None,
        next_cursor_id=cursor_row.id if cursor_row else None,
    )
