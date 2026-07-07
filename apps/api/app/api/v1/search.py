"""Cross-project search (PLAN §3 Phase 2 + expansion Pass 14 통합 검색).

Scope is the caller's member projects only — the same existence-hiding boundary as
every other read path. Non-member projects never appear in results; archived
projects are excluded. Matching is icontains with %/_ autoescape (§6.1); the
unified endpoint groups results per resource kind with a limit+1 truncation
probe (v14.1 — never a silent cut). Documents/meetings match on TITLE only
(full-text body search is a follow-up).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.cycle import Cycle
from app.models.document import ProjectDocument
from app.models.initiative import Initiative, InitiativeProject
from app.models.meeting import Meeting
from app.models.member import ProjectMember
from app.models.module import Module
from app.models.project import Project
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.search import (
    DocumentGroup,
    InitiativeGroup,
    MeetingGroup,
    NamedGroup,
    SearchDocumentItem,
    SearchInitiativeItem,
    SearchMeetingItem,
    SearchNamedItem,
    SearchResultItem,
    SearchResults,
    UnifiedSearchResults,
    WpGroup,
)
from app.services.snippet import extract_snippet

router = APIRouter()


def _member_project_ids(user: User):
    return select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)


@router.get("/search/work-packages", response_model=SearchResults)
async def search_work_packages(
    q: str = Query(min_length=1, max_length=255),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SearchResults:
    member_projects = _member_project_ids(user)
    stmt = (
        select(WorkPackage, Project.key, Project.name)
        .join(Project, WorkPackage.project_id == Project.id)
        .where(WorkPackage.project_id.in_(member_projects))
        .where(Project.archived_at.is_(None))
        # Case-insensitive substring; %/_ wildcards autoescaped (§6.1).
        .where(WorkPackage.subject.icontains(q, autoescape=True))
        .order_by(WorkPackage.updated_at.desc(), WorkPackage.id.asc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
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
            due_date=wp.due_date,
        )
        for wp, key, name in rows
    ]
    return SearchResults(items=items, total=len(items), query=q)


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
    member_projects = _member_project_ids(user)
    probe = limit + 1  # limit+1 fetch → truncated without a COUNT round-trip

    def scoped(model, text_col, *content_cols):
        # Content predicates live INSIDE the member/archive scope — the OR
        # can never widen visibility (v39.1 R1-③).
        match = text_col.icontains(q, autoescape=True)
        for col in content_cols:
            match = match | col.icontains(q, autoescape=True)
        return (
            select(model, Project.key, Project.name)
            .join(Project, model.project_id == Project.id)
            .where(model.project_id.in_(member_projects))
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
    doc_rows = (
        await session.execute(
            scoped(ProjectDocument, ProjectDocument.title, ProjectDocument.body)
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
    # member of at least one connected project (existing derived-visibility rule).
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
                                InitiativeProject.project_id.in_(member_projects)
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
