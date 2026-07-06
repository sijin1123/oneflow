"""Cross-project work-package search (PLAN §3 Phase 2 크로스 프로젝트 검색).

Scope is the caller's member projects only — the same existence-hiding boundary as
every other read path. Non-member projects never appear in results.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.project import Project
from app.models.user import User
from app.models.work_package import WorkPackage
from app.schemas.search import SearchResultItem, SearchResults

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
