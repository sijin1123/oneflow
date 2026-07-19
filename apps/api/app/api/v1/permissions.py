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
from app.core.authz import member_access, permission_level
from app.core.permissions import DELEGABLE_PROJECT_PERMISSIONS, PERMISSION_MATRIX
from app.db.session import get_session
from app.models.user import User
from app.schemas.permission import PermissionCustomRole, PermissionReportRead, PermissionVerb

router = APIRouter()


@router.get("/projects/{project_id}/permissions", response_model=PermissionReportRead)
async def permission_report(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PermissionReportRead:
    access = await member_access(session, project_id, user.id)
    if access is None:
        raise HTTPException(status_code=404, detail="not found")  # existence hiding
    # Archived projects stay readable — this is a read-only report (no write gate).
    return PermissionReportRead(
        my_role=access.role,
        my_custom_role=(
            PermissionCustomRole(
                id=access.custom_role_id,
                name=access.custom_role_name,
                permissions=[
                    key for key in DELEGABLE_PROJECT_PERMISSIONS if key in access.custom_permissions
                ],
            )
            if access.custom_role_id is not None and access.custom_role_name is not None
            else None
        ),
        verbs=[
            PermissionVerb(**row, effective=permission_level(access, str(row["key"])))
            for row in PERMISSION_MATRIX
        ],
    )
