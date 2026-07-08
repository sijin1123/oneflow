"""Project automation rules (PLAN §3 Phase 3 자동화).

Members read rules; owners create/toggle/delete them. Rules are evaluated by
app.services.automation inside the work-package PATCH transaction.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.authz import member_role, require_member, require_role
from app.db.session import get_session
from app.models.automation_rule import AutomationRule, AutomationRuleRun
from app.models.user import User
from app.schemas.automation_rule import (
    AutomationRuleCreate,
    AutomationRuleList,
    AutomationRuleRead,
    AutomationRuleRunList,
    AutomationRuleRunRead,
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


async def _require_assignee_value_member(
    session: AsyncSession, project_id: uuid.UUID, body_like: AutomationRuleCreate
) -> None:
    """set_assignee's value must be a CURRENT project member with a writable
    role (v16.1 R1-④, v61.1 R1-⑥ — the same predicate the ordinary assignee
    fan-in uses; viewers are read-only and cannot be assignment targets)."""
    if body_like.action_type != "set_assignee":
        return
    role = await member_role(session, project_id, uuid.UUID(body_like.action_value))
    if role is None:
        raise HTTPException(status_code=422, detail="action_value must be a project member")
    if role == "viewer":
        raise HTTPException(status_code=422, detail="action_value must not have a read-only role")


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


@router.get("/projects/{project_id}/automation-rules/runs", response_model=AutomationRuleRunList)
async def list_automation_rule_runs(
    project_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AutomationRuleRunList:
    """Per-WP automation audit trail, newest first (member read — the same
    visibility as the rules themselves)."""
    await require_member(session, project_id, user)
    rows = (
        (
            await session.execute(
                select(AutomationRuleRun)
                .where(AutomationRuleRun.project_id == project_id)
                .order_by(AutomationRuleRun.created_at.desc(), AutomationRuleRun.id.asc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return AutomationRuleRunList(
        items=[AutomationRuleRunRead.model_validate(r) for r in rows], total=len(rows)
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
    await _require_assignee_value_member(session, project_id, body)
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
    provided = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    # Validate the MERGED rule with the same fan-in as create (v13.1 R1-③) —
    # a partial edit can never leave the trigger/action pair invalid.
    merged = {
        "name": rule.name,
        "trigger_type": rule.trigger_type,
        "trigger_value": rule.trigger_value,
        "action_type": rule.action_type,
        "action_value": rule.action_value,
        "is_active": rule.is_active,
        **provided,
    }
    try:
        merged_rule = AutomationRuleCreate(**merged)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()[0]["msg"]) from exc
    await _require_assignee_value_member(session, project_id, merged_rule)
    for key, value in provided.items():
        setattr(rule, key, value)
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
