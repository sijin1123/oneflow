import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.member import ProjectMember
from app.models.user import User
from app.schemas.member import MemberCreate, MemberList, MemberRead, MemberRoleUpdate

router = APIRouter()


async def _owner_count(session: AsyncSession, project_id: uuid.UUID) -> int:
    return (
        await session.execute(
            select(func.count())
            .select_from(ProjectMember)
            .where(ProjectMember.project_id == project_id, ProjectMember.role == "owner")
        )
    ).scalar_one()


@router.get("/projects/{project_id}/members", response_model=MemberList)
async def list_members(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MemberList:
    await require_member(session, project_id, user)  # any member can view the roster
    rows = (
        await session.execute(
            select(ProjectMember, User)
            .join(User, ProjectMember.user_id == User.id)
            .where(ProjectMember.project_id == project_id)
            .order_by(User.display_name.asc())
        )
    ).all()
    items = [
        MemberRead(user_id=u.id, email=u.email, display_name=u.display_name, role=m.role)
        for (m, u) in rows
    ]
    return MemberList(items=items, total=len(items))


@router.post("/projects/{project_id}/members", response_model=MemberRead, status_code=201)
async def add_member(
    project_id: uuid.UUID,
    body: MemberCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MemberRead:
    await require_role(session, project_id, user, {"owner"})  # 404 non-member / 403 non-owner
    target = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="no user with that email")
    existing = (
        await session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == target.id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="user is already a member")
    session.add(ProjectMember(project_id=project_id, user_id=target.id, role=body.role))
    await session.commit()
    return MemberRead(
        user_id=target.id, email=target.email, display_name=target.display_name, role=body.role
    )


@router.patch("/projects/{project_id}/members/{user_id}", response_model=MemberRead)
async def update_member_role(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    body: MemberRoleUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MemberRead:
    await require_role(session, project_id, user, {"owner"})
    membership = (
        await session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=404, detail="not found")
    # Never leave a project without an owner.
    demoting_owner = membership.role == "owner" and body.role != "owner"
    if demoting_owner and await _owner_count(session, project_id) <= 1:
        raise HTTPException(status_code=422, detail="a project must keep at least one owner")
    membership.role = body.role
    await session.commit()
    target = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
    return MemberRead(
        user_id=target.id, email=target.email, display_name=target.display_name, role=body.role
    )


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_role(session, project_id, user, {"owner"})
    membership = (
        await session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=404, detail="not found")
    if membership.role == "owner" and await _owner_count(session, project_id) <= 1:
        raise HTTPException(status_code=422, detail="a project must keep at least one owner")
    await session.delete(membership)
    await session.commit()
    return Response(status_code=204)
