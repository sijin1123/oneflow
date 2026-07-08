"""Project permission report (Pass 62 PR-CA).

Read-only surface: shows the FIXED role matrix as enforced (documentation
registry app/core/permissions.py — accuracy and coverage pytest keep it
honest). Members read it (viewer included — P61 read = member read); the
matrix itself is workspace-static, but the endpoint stays project-scoped for
my_role and any future per-project roles."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import member_role
from app.core.permissions import PERMISSION_MATRIX
from app.db.session import get_session
from app.models.user import User
from app.schemas.permission import PermissionReportRead, PermissionVerb

router = APIRouter()


@router.get("/projects/{project_id}/permissions", response_model=PermissionReportRead)
async def permission_report(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PermissionReportRead:
    role = await member_role(session, project_id, user.id)
    if role is None:
        raise HTTPException(status_code=404, detail="not found")  # existence hiding
    # Archived projects stay readable — this is a read-only report (no write gate).
    return PermissionReportRead(
        my_role=role,
        verbs=[PermissionVerb(**row) for row in PERMISSION_MATRIX],
    )
