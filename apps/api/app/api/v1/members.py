import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.document import ProjectDocument
from app.models.member import ProjectMember
from app.models.project_role import ProjectRole
from app.models.user import User
from app.schemas.member import MemberCreate, MemberList, MemberRead, MemberRoleUpdate

router = APIRouter()

# Advisory-lock classid serializing membership mutations per project, so the
# "keep at least one owner" count-then-write cannot race two concurrent demotions
# into a zero-owner (unadministrable) project (fable5 audit: last-owner race).
MEMBER_LOCK_CLASSID = 427002


async def _lock_project_members(session: AsyncSession, project_id: uuid.UUID) -> None:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
            classid=MEMBER_LOCK_CLASSID, pid=str(project_id)
        )
    )


async def _owner_count(session: AsyncSession, project_id: uuid.UUID) -> int:
    return (
        await session.execute(
            select(func.count())
            .select_from(ProjectMember)
            .where(ProjectMember.project_id == project_id, ProjectMember.role == "owner")
        )
    ).scalar_one()


async def _assignable_custom_role(
    session: AsyncSession,
    role: str,
    custom_role_id: uuid.UUID | None,
) -> ProjectRole | None:
    if custom_role_id is None:
        return None
    if role != "member":
        raise HTTPException(
            status_code=422,
            detail="custom roles can only be assigned with the member role",
        )
    custom_role = (
        await session.execute(
            select(ProjectRole).where(ProjectRole.id == custom_role_id).with_for_update()
        )
    ).scalar_one_or_none()
    if custom_role is None:
        raise HTTPException(status_code=422, detail="custom project role does not exist")
    if custom_role.archived_at is not None:
        raise HTTPException(status_code=409, detail="custom project role is archived")
    return custom_role


def _read_member(
    membership: ProjectMember,
    target: User,
    custom_role: ProjectRole | None,
) -> MemberRead:
    return MemberRead(
        user_id=target.id,
        email=target.email,
        display_name=target.display_name,
        profile_image_url=target.project_profile_image_url(membership.project_id),
        role=membership.role,
        custom_role_id=membership.custom_role_id,
        custom_role_name=custom_role.name if custom_role is not None else None,
    )


@router.get("/projects/{project_id}/members", response_model=MemberList)
async def list_members(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MemberList:
    await require_member(session, project_id, user)  # any member can view the roster
    rows = (
        await session.execute(
            select(ProjectMember, User, ProjectRole)
            .join(User, ProjectMember.user_id == User.id)
            .outerjoin(ProjectRole, ProjectRole.id == ProjectMember.custom_role_id)
            .where(ProjectMember.project_id == project_id)
            .order_by(User.display_name.asc())
        )
    ).all()
    items = [
        _read_member(membership, target, custom_role) for (membership, target, custom_role) in rows
    ]
    return MemberList(items=items, total=len(items))


@router.post("/projects/{project_id}/members", response_model=MemberRead, status_code=201)
async def add_member(
    project_id: uuid.UUID,
    body: MemberCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MemberRead:
    await require_role(
        session, project_id, user, {"owner"}, write=True
    )  # 404 non-member / 403 non-owner
    target = (
        await session.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="no user with that email")
    # Deactivated accounts keep existing memberships and history, but never
    # enter NEW projects (v33.1 R1-(5) -- the one new-reference write closed).
    if not target.is_active:
        raise HTTPException(status_code=409, detail="user is deactivated")
    existing = (
        await session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == target.id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="user is already a member")
    custom_role = await _assignable_custom_role(session, body.role, body.custom_role_id)
    membership = ProjectMember(
        project_id=project_id,
        user_id=target.id,
        role=body.role,
        custom_role_id=custom_role.id if custom_role is not None else None,
    )
    session.add(membership)
    try:
        await session.commit()
    except IntegrityError as exc:
        # Two concurrent adds race past the SELECT check; the uniqueness violation
        # is a clean 409, never a leaked 500 (fable5 audit: residual IntegrityError).
        await session.rollback()
        raise HTTPException(status_code=409, detail="user is already a member") from exc
    return _read_member(membership, target, custom_role)


@router.patch("/projects/{project_id}/members/{user_id}", response_model=MemberRead)
async def update_member_role(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    body: MemberRoleUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MemberRead:
    await require_role(session, project_id, user, {"owner"}, write=True)
    # Serialize membership mutations per project before the count-then-write.
    await _lock_project_members(session, project_id)
    membership = (
        await session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=404, detail="not found")
    # Never leave a project without an owner (guard now race-free under the lock).
    demoting_owner = membership.role == "owner" and body.role != "owner"
    if demoting_owner and await _owner_count(session, project_id) <= 1:
        raise HTTPException(status_code=422, detail="a project must keep at least one owner")
    custom_role = await _assignable_custom_role(session, body.role, body.custom_role_id)
    membership.role = body.role
    membership.custom_role_id = custom_role.id if custom_role is not None else None
    await session.commit()
    target = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
    return _read_member(membership, target, custom_role)


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_role(session, project_id, user, {"owner"}, write=True)
    # Serialize membership mutations per project before the count-then-write.
    await _lock_project_members(session, project_id)
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
    private_documents = await session.scalar(
        select(func.count())
        .select_from(ProjectDocument)
        .where(
            ProjectDocument.project_id == project_id,
            ProjectDocument.author_id == user_id,
            ProjectDocument.visibility == "private",
        )
    )
    if private_documents:
        raise HTTPException(
            status_code=409,
            detail="share or delete the member's private documents before removal",
        )
    await session.delete(membership)
    await session.commit()
    return Response(status_code=204)
