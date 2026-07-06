"""Project automation rules (PLAN §3 Phase 3 자동화).

Members read rules; owners create/toggle/delete them. Rules are evaluated by
app.services.automation inside the work-package PATCH transaction.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import require_member, require_role
from app.db.session import get_session
from app.models.automation_rule import AutomationRule
from app.models.user import User
from app.schemas.automation_rule import (
    AutomationRuleCreate,
    AutomationRuleList,
    AutomationRuleRead,
    AutomationRuleUpdate,
)

router = APIRouter()


async def _get_owned_rule(
    session: AsyncSession, project_id: uuid.UUID, rule_id: uuid.UUID
) -> AutomationRule:
    row = (
        await session.execute(
            select(AutomationRule).where(
                AutomationRule.id == rule_id, AutomationRule.project_id == project_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    return row


@router.get("/projects/{project_id}/automation-rules", response_model=AutomationRuleList)
async def list_automation_rules(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AutomationRuleList:
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(AutomationRule)
                .where(AutomationRule.project_id == project_id)
                .order_by(AutomationRule.created_at.asc(), AutomationRule.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return AutomationRuleList(
        items=[AutomationRuleRead.model_validate(r) for r in rows], total=len(rows)
    )


@router.post(
    "/projects/{project_id}/automation-rules",
    response_model=AutomationRuleRead,
    status_code=201,
)
async def create_automation_rule(
    project_id: uuid.UUID,
    body: AutomationRuleCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AutomationRuleRead:
    await require_role(session, project_id, user, {"owner"}, write=True)
    rule = AutomationRule(
        project_id=project_id,
        name=body.name,
        trigger_type=body.trigger_type,
        trigger_value=body.trigger_value,
        action_type=body.action_type,
        action_value=body.action_value,
        is_active=body.is_active,
    )
    session.add(rule)
    await session.flush()
    await session.commit()
    return AutomationRuleRead.model_validate(rule)


@router.patch(
    "/projects/{project_id}/automation-rules/{rule_id}", response_model=AutomationRuleRead
)
async def update_automation_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    body: AutomationRuleUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AutomationRuleRead:
    await require_role(session, project_id, user, {"owner"}, write=True)
    rule = await _get_owned_rule(session, project_id, rule_id)
    rule.is_active = body.is_active
    await session.commit()
    await session.refresh(rule)
    return AutomationRuleRead.model_validate(rule)


@router.delete("/projects/{project_id}/automation-rules/{rule_id}", status_code=204)
async def delete_automation_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    await require_role(session, project_id, user, {"owner"}, write=True)
    rule = await _get_owned_rule(session, project_id, rule_id)
    await session.delete(rule)
    await session.commit()
    return Response(status_code=204)
