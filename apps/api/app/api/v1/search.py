"""Cross-project search (PLAN §3 Phase 2 + expansion Pass 14 통합 검색).

Scope is the caller's member projects only — the same existence-hiding boundary as
every other read path. Non-member projects never appear in results; archived
projects are excluded. Matching is icontains with %/_ autoescape (§6.1); the
unified endpoint groups results per resource kind with a limit+1 truncation
probe (v14.1 — never a silent cut). Documents/meetings match on TITLE only
(full-text body search is a follow-up).
"""

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.auth import get_current_user
from app.core.dates import utc_today
from app.db.session import get_session
from app.models.cycle import Cycle
from app.models.document import ProjectDocument
from app.models.initiative import Initiative, InitiativeProject
from app.models.meeting import Meeting
from app.models.member import ProjectMember
from app.models.module import Module
from app.models.project import Project
from app.models.user import User
from app.models.watcher import WpWatcher
from app.models.work_package import WP_CLOSED_STATUSES, WP_PRIORITIES, WP_STATUSES, WorkPackage
from app.schemas.search import (
    DocumentGroup,
    InitiativeGroup,
    MeetingGroup,
    NamedGroup,
    SearchAnalyticsBucket,
    SearchAnalyticsProject,
    SearchAnalyticsProjectOverflow,
    SearchAnalyticsScheduleBuckets,
    SearchDocumentItem,
    SearchInitiativeItem,
    SearchMeetingItem,
    SearchNamedItem,
    SearchResultItem,
    SearchResults,
    SearchWorkPackageAnalytics,
    UnifiedSearchResults,
    WpGroup,
)
from app.services.document_access import document_visible_clause
from app.services.snippet import extract_snippet
from app.services.workspace_features import INITIATIVES_FEATURE, feature_enabled
from app.services.workspace_pql import (
    PqlError,
    compile_pql,
    parse_pql,
    pql_ordering,
    validate_pql_values,
)

router = APIRouter()


class PqlValidationRequest(BaseModel):
    query: str = Field(max_length=1000)


class PqlValidationResponse(BaseModel):
    normalized: str
    fields: list[str]
    order_by: str | None
    direction: str | None
    limit: int | None


def _visible_member_project_ids(user: User):
    return (
        select(ProjectMember.project_id)
        .join(Project, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id)
        .where(Project.archived_at.is_(None))
    )


async def _workspace_work_package_statement(
    session: AsyncSession,
    user: User,
    q: str | None,
    scope: Literal["all", "assigned", "created", "subscribed"],
    state: Literal["all", "open"],
    priority: Literal["none", "low", "medium", "high", "urgent"] | None,
    pql: str | None,
):
    """Build the shared authorized workspace set for list and analytics."""
    Assignee = aliased(User)
    CurrentMember = aliased(ProjectMember)
    stmt = (
        select(
            WorkPackage,
            Project.key,
            Project.name,
            Assignee.display_name,
            CurrentMember.role,
        )
        .join(Project, WorkPackage.project_id == Project.id)
        .join(
            CurrentMember,
            (CurrentMember.project_id == WorkPackage.project_id)
            & (CurrentMember.user_id == user.id),
        )
        .outerjoin(Assignee, WorkPackage.assignee_id == Assignee.id)
        .where(Project.archived_at.is_(None))
    )
    if q is not None:
        # Case-insensitive substring; %/_ wildcards autoescaped (§6.1).
        stmt = stmt.where(WorkPackage.subject.icontains(q, autoescape=True))
    if scope == "assigned":
        stmt = stmt.where(WorkPackage.assignee_id == user.id)
    elif scope == "created":
        stmt = stmt.where(WorkPackage.created_by == user.id)
    elif scope == "subscribed":
        stmt = stmt.join(
            WpWatcher,
            (WpWatcher.work_package_id == WorkPackage.id) & (WpWatcher.user_id == user.id),
        )
    if state == "open":
        stmt = stmt.where(WorkPackage.status.not_in(WP_CLOSED_STATUSES))
    if priority is not None:
        stmt = stmt.where(WorkPackage.priority == priority)

    parsed_pql = None
    if pql is not None:
        try:
            parsed_pql = parse_pql(pql)
            await validate_pql_values(session, user, parsed_pql)
        except PqlError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        stmt = stmt.where(compile_pql(parsed_pql, user, Assignee))
    return stmt, parsed_pql


def _workspace_work_package_ordering(sort: str):
    if sort == "due":
        return (
            WorkPackage.due_date.asc().nulls_last(),
            WorkPackage.updated_at.desc(),
            WorkPackage.id.asc(),
        )
    if sort in {"status_asc", "status_desc"}:
        status_order = (
            WorkPackage.status.asc() if sort == "status_asc" else WorkPackage.status.desc()
        )
        return (status_order, WorkPackage.updated_at.desc(), WorkPackage.id.asc())
    if sort in {"priority_asc", "priority_desc"}:
        priority_order = case(
            (WorkPackage.priority == "none", 0),
            (WorkPackage.priority == "low", 1),
            (WorkPackage.priority == "medium", 2),
            (WorkPackage.priority == "high", 3),
            (WorkPackage.priority == "urgent", 4),
            else_=5,
        )
        priority_order = priority_order.desc() if sort == "priority_desc" else priority_order.asc()
        return (priority_order, WorkPackage.updated_at.desc(), WorkPackage.id.asc())
    return (WorkPackage.updated_at.desc(), WorkPackage.id.asc())


@router.get("/search/work-packages", response_model=SearchResults)
async def search_work_packages(
    q: str | None = Query(default=None, min_length=1, max_length=255),
    scope: Literal["all", "assigned", "created", "subscribed"] = "all",
    state: Literal["all", "open"] = "all",
    sort: Literal[
        "updated", "due", "status_asc", "status_desc", "priority_asc", "priority_desc"
    ] = "updated",
    priority: Literal["none", "low", "medium", "high", "urgent"] | None = None,
    pql: str | None = Query(default=None, max_length=1000),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SearchResults:
    stmt, parsed_pql = await _workspace_work_package_statement(
        session, user, q, scope, state, priority, pql
    )

    total = (
        await session.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))
    ).scalar_one()
    order_by = _workspace_work_package_ordering(sort)
    result_limit = limit
    if parsed_pql is not None:
        order_by = pql_ordering(parsed_pql) or order_by
        if parsed_pql.limit is not None:
            total = min(total, parsed_pql.limit)
            result_limit = min(result_limit, max(0, parsed_pql.limit - offset))
    rows = (
        await session.execute(stmt.order_by(*order_by).limit(result_limit).offset(offset))
    ).all()
    items = [
        SearchResultItem(
            id=wp.id,
            project_id=wp.project_id,
            project_key=key,
            project_name=name,
            subject=wp.subject,
            status=wp.status,
            priority=wp.priority,
            type=wp.type,
            assignee_id=wp.assignee_id,
            assignee_name=assignee_name,
            start_date=wp.start_date,
            due_date=wp.due_date,
            created_at=wp.created_at,
            updated_at=wp.updated_at,
            version=wp.version,
            current_user_can_write=member_role != "viewer",
        )
        for wp, key, name, assignee_name, member_role in rows
    ]
    return SearchResults(items=items, total=total, query=q or "")


@router.get("/search/work-packages/analytics", response_model=SearchWorkPackageAnalytics)
async def search_work_package_analytics(
    q: str | None = Query(default=None, min_length=1, max_length=255),
    scope: Literal["all", "assigned", "created", "subscribed"] = "all",
    state: Literal["all", "open"] = "all",
    priority: Literal["none", "low", "medium", "high", "urgent"] | None = None,
    pql: str | None = Query(default=None, max_length=1000),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SearchWorkPackageAnalytics:
    stmt, parsed_pql = await _workspace_work_package_statement(
        session, user, q, scope, state, priority, pql
    )
    analytics_stmt = stmt.with_only_columns(
        WorkPackage.id.label("work_package_id"),
        WorkPackage.project_id.label("project_id"),
        Project.key.label("project_key"),
        Project.name.label("project_name"),
        WorkPackage.status.label("status"),
        WorkPackage.priority.label("priority"),
        WorkPackage.due_date.label("due_date"),
        maintain_column_froms=True,
    )
    if parsed_pql is not None and parsed_pql.limit is not None:
        order_by = pql_ordering(parsed_pql) or _workspace_work_package_ordering("updated")
        analytics_stmt = analytics_stmt.order_by(*order_by).limit(parsed_pql.limit)
    else:
        analytics_stmt = analytics_stmt.order_by(None)
    filtered = analytics_stmt.subquery()

    today = utc_today()
    next_week = today + timedelta(days=7)
    is_closed = filtered.c.status.in_(WP_CLOSED_STATUSES)
    is_open = filtered.c.status.not_in(WP_CLOSED_STATUSES)
    summary_columns = [func.count().label("total")]
    summary_columns.extend(
        func.count().filter(filtered.c.status == status).label(f"status_{status}")
        for status in WP_STATUSES
    )
    summary_columns.extend(
        func.count().filter(filtered.c.priority == priority_key).label(f"priority_{priority_key}")
        for priority_key in WP_PRIORITIES
    )
    summary_columns.extend(
        (
            func.count().filter(is_closed).label("completed"),
            func.count().filter(is_open, filtered.c.due_date < today).label("open_overdue"),
            func.count()
            .filter(
                is_open,
                filtered.c.due_date >= today,
                filtered.c.due_date <= next_week,
            )
            .label("open_due_next_7_days"),
            func.count().filter(is_open, filtered.c.due_date > next_week).label("open_later"),
            func.count().filter(is_open, filtered.c.due_date.is_(None)).label("open_unscheduled"),
        )
    )
    aggregate_row = (await session.execute(select(*summary_columns).select_from(filtered))).one()

    project_counts = (
        select(
            filtered.c.project_id.label("id"),
            filtered.c.project_key.label("key"),
            filtered.c.project_name.label("name"),
            func.count().label("count"),
        )
        .group_by(filtered.c.project_id, filtered.c.project_key, filtered.c.project_name)
        .subquery()
    )
    top_project_rows = (
        await session.execute(
            select(project_counts)
            .order_by(
                project_counts.c.count.desc(),
                project_counts.c.key.asc(),
                project_counts.c.id,
            )
            .limit(10)
        )
    ).all()
    project_count = (
        await session.execute(select(func.count()).select_from(project_counts))
    ).scalar_one()
    top_item_count = sum(count for _, _, _, count in top_project_rows)

    return SearchWorkPackageAnalytics(
        total=aggregate_row.total,
        status_buckets=[
            SearchAnalyticsBucket(key=status, count=getattr(aggregate_row, f"status_{status}"))
            for status in WP_STATUSES
        ],
        priority_buckets=[
            SearchAnalyticsBucket(
                key=priority_key,
                count=getattr(aggregate_row, f"priority_{priority_key}"),
            )
            for priority_key in WP_PRIORITIES
        ],
        top_projects=[
            SearchAnalyticsProject(id=project_id, key=key, name=name, count=count)
            for project_id, key, name, count in top_project_rows
        ],
        project_overflow=SearchAnalyticsProjectOverflow(
            project_count=max(0, project_count - len(top_project_rows)),
            item_count=aggregate_row.total - top_item_count,
        ),
        schedule_buckets=SearchAnalyticsScheduleBuckets(
            completed=aggregate_row.completed,
            open_overdue=aggregate_row.open_overdue,
            open_due_next_7_days=aggregate_row.open_due_next_7_days,
            open_later=aggregate_row.open_later,
            open_unscheduled=aggregate_row.open_unscheduled,
        ),
    )


@router.post("/search/work-packages/pql/validate", response_model=PqlValidationResponse)
async def validate_workspace_pql(
    body: PqlValidationRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PqlValidationResponse:
    try:
        parsed = parse_pql(body.query)
        await validate_pql_values(session, user, parsed)
    except PqlError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return PqlValidationResponse(
        normalized=parsed.normalized,
        fields=parsed.fields,
        order_by=parsed.order_by,
        direction=parsed.direction,
        limit=parsed.limit,
    )


@router.get("/search", response_model=UnifiedSearchResults)
async def unified_search(
    q: str = Query(min_length=2, max_length=255),
    limit: int = Query(default=20, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UnifiedSearchResults:
    """Grouped workspace search (v14.1). Ordering contract: work packages keep
    the existing updated_at desc; documents/meetings sort by title asc,
    cycles/modules/initiatives by name asc; ties break on id asc."""
    visible_member_projects = _visible_member_project_ids(user)
    probe = limit + 1  # limit+1 fetch → truncated without a COUNT round-trip
    wiki_is_enabled = await feature_enabled(session)
    initiatives_are_enabled = await feature_enabled(session, INITIATIVES_FEATURE)

    def scoped(model, text_col, *content_cols):
        # Content predicates live INSIDE the member/archive scope — the OR
        # can never widen visibility (v39.1 R1-③).
        match = text_col.icontains(q, autoescape=True)
        for col in content_cols:
            match = match | col.icontains(q, autoescape=True)
        return (
            select(model, Project.key, Project.name)
            .join(Project, model.project_id == Project.id)
            .where(model.project_id.in_(visible_member_projects))
            .where(Project.archived_at.is_(None))
            .where(match)
        )

    def classify(primary: str, *contents: str | None) -> tuple[str, str | None]:
        """v39.1 R1-② table: primary wins (snippet null); content-only items
        carry a plain-text snippet — null when the match was markup-only."""
        if q.lower() in primary.lower():
            return "primary", None
        for content in contents:
            if content:
                snippet = extract_snippet(content, q)
                if snippet is not None:
                    return "content", snippet
        return "content", None

    wp_rows = (
        await session.execute(
            scoped(WorkPackage, WorkPackage.subject, WorkPackage.description)
            .order_by(WorkPackage.updated_at.desc(), WorkPackage.id.asc())
            .limit(probe)
        )
    ).all()
    doc_rows = []
    if wiki_is_enabled:
        doc_rows = (
            await session.execute(
                scoped(ProjectDocument, ProjectDocument.title, ProjectDocument.body)
                .where(ProjectDocument.archived_at.is_(None))
                .where(document_visible_clause(user.id))
                .order_by(ProjectDocument.title.asc(), ProjectDocument.id.asc())
                .limit(probe)
            )
        ).all()
    meeting_rows = (
        await session.execute(
            scoped(Meeting, Meeting.title, Meeting.agenda, Meeting.minutes)
            .order_by(Meeting.title.asc(), Meeting.id.asc())
            .limit(probe)
        )
    ).all()
    cycle_rows = (
        await session.execute(
            scoped(Cycle, Cycle.name).order_by(Cycle.name.asc(), Cycle.id.asc()).limit(probe)
        )
    ).all()
    module_rows = (
        await session.execute(
            scoped(Module, Module.name).order_by(Module.name.asc(), Module.id.asc()).limit(probe)
        )
    ).all()
    # Initiatives are workspace-level: visible if you created one or you are a
    # member of at least one connected *visible* project. Hidden/archived-only
    # connections must not affect counts, truncation, or snippets in global search.
    initiative_rows = []
    if initiatives_are_enabled:
        initiative_rows = (
            (
                await session.execute(
                    select(Initiative)
                    .where(Initiative.name.icontains(q, autoescape=True))
                    .where(
                        or_(
                            Initiative.owner_id == user.id,
                            Initiative.id.in_(
                                select(InitiativeProject.initiative_id).where(
                                    InitiativeProject.project_id.in_(visible_member_projects)
                                )
                            ),
                        )
                    )
                    .order_by(Initiative.name.asc(), Initiative.id.asc())
                    .limit(probe)
                )
            )
            .scalars()
            .all()
        )

    def cut(rows):
        return rows[:limit], len(rows) > limit

    wps, wp_trunc = cut(wp_rows)
    docs, doc_trunc = cut(doc_rows)
    meetings, meeting_trunc = cut(meeting_rows)
    cycles, cycle_trunc = cut(cycle_rows)
    modules, module_trunc = cut(module_rows)
    initiatives, initiative_trunc = cut(initiative_rows)

    wp_items = []
    for wp, key, name in wps:
        matched_in, snippet = classify(wp.subject, wp.description)
        wp_items.append(
            SearchResultItem(
                id=wp.id,
                project_id=wp.project_id,
                project_key=key,
                project_name=name,
                subject=wp.subject,
                status=wp.status,
                priority=wp.priority,
                type=wp.type,
                due_date=wp.due_date,
                matched_in=matched_in,
                snippet=snippet,
            )
        )

    def named(rows) -> list[SearchNamedItem]:
        return [
            SearchNamedItem(
                id=row.id,
                project_id=row.project_id,
                project_key=key,
                project_name=name,
                name=row.name,
            )
            for row, key, name in rows
        ]

    return UnifiedSearchResults(
        query=q,
        work_packages=WpGroup(items=wp_items, returned=len(wp_items), truncated=wp_trunc),
        documents=DocumentGroup(
            items=[
                SearchDocumentItem(
                    id=d.id,
                    project_id=d.project_id,
                    project_key=key,
                    project_name=name,
                    title=d.title,
                    matched_in=(dm := classify(d.title, d.body))[0],
                    snippet=dm[1],
                )
                for d, key, name in docs
            ],
            returned=len(docs),
            truncated=doc_trunc,
        ),
        meetings=MeetingGroup(
            items=[
                SearchMeetingItem(
                    id=m.id,
                    project_id=m.project_id,
                    project_key=key,
                    project_name=name,
                    title=m.title,
                    scheduled_on=m.scheduled_on,
                    matched_in=(mm := classify(m.title, m.agenda, m.minutes))[0],
                    snippet=mm[1],
                )
                for m, key, name in meetings
            ],
            returned=len(meetings),
            truncated=meeting_trunc,
        ),
        cycles=NamedGroup(items=named(cycles), returned=len(cycles), truncated=cycle_trunc),
        modules=NamedGroup(items=named(modules), returned=len(modules), truncated=module_trunc),
        initiatives=InitiativeGroup(
            items=[SearchInitiativeItem(id=i.id, name=i.name, state=i.state) for i in initiatives],
            returned=len(initiatives),
            truncated=initiative_trunc,
        ),
    )
