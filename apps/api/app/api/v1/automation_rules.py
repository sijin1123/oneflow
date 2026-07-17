"""Project automation rules (PLAN §3 Phase 3 자동화).

Members read rules; owners create/toggle/delete them. Rules are evaluated by
app.services.automation inside the work-package PATCH transaction.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.project_types import require_type_enabled
from app.core.auth import get_current_user
from app.core.authz import member_role, require_member, require_role
from app.db.session import get_session
from app.models.automation_rule import AutomationRule, AutomationRuleRun
from app.models.user import User
from app.schemas.automation_rule import (
    AutomationRuleCreate,
    AutomationRuleList,
    AutomationRuleRead,
    AutomationRuleReorder,
    AutomationRuleRunList,
    AutomationRuleRunRead,
    AutomationRuleUpdate,
)

router = APIRouter()

# Serializes concurrent create/reorder per project so positions stay a total
# order (Pass 82 R1-①; 427002 member-lock precedent — one project → one key).
AUTOMATION_ORDER_LOCK_CLASSID = 427011


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


async def _require_active_rule_types(
    session: AsyncSession, project_id: uuid.UUID, body_like: AutomationRuleCreate
) -> None:
    if body_like.trigger_type == "type_changed_to":
        await require_type_enabled(session, project_id, body_like.trigger_value)
    if body_like.condition_field == "type" and body_like.condition_value is not None:
        await require_type_enabled(session, project_id, body_like.condition_value)


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
                .order_by(
                    AutomationRule.position.asc(),
                    AutomationRule.created_at.asc(),
                    AutomationRule.id.asc(),
                )
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
    await _require_active_rule_types(session, project_id, body)
    # Serialize with reorder so positions stay a total order (R1-①); new rules
    # append at MAX(position)+1.
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
            classid=AUTOMATION_ORDER_LOCK_CLASSID, pid=str(project_id)
        )
    )
    next_position = (
        await session.execute(
            select(func.coalesce(func.max(AutomationRule.position), -1) + 1).where(
                AutomationRule.project_id == project_id
            )
        )
    ).scalar_one()
    rule = AutomationRule(
        project_id=project_id,
        name=body.name,
        trigger_type=body.trigger_type,
        trigger_value=body.trigger_value,
        action_type=body.action_type,
        action_value=body.action_value,
        condition_field=body.condition_field,
        condition_value=body.condition_value,
        position=next_position,
        is_active=body.is_active,
    )
    session.add(rule)
    await session.flush()
    await session.commit()
    return AutomationRuleRead.model_validate(rule)


@router.put("/projects/{project_id}/automation-rules/order", response_model=AutomationRuleList)
async def reorder_automation_rules(
    project_id: uuid.UUID,
    body: AutomationRuleReorder,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AutomationRuleList:
    """Owner-only atomic reorder (Pass 82 — the custom-fields /order contract):
    ordered_ids must list EXACTLY this project's rules (active + inactive);
    positions rewrite 0..n-1 in one transaction under the project order lock so
    a concurrent create can't interleave a duplicate position."""
    await require_role(session, project_id, user, {"owner"}, write=True)
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:classid, hashtext(:pid))").bindparams(
            classid=AUTOMATION_ORDER_LOCK_CLASSID, pid=str(project_id)
        )
    )
    rows = (
        (
            await session.execute(
                select(AutomationRule).where(AutomationRule.project_id == project_id)
            )
        )
        .scalars()
        .all()
    )
    by_id = {r.id: r for r in rows}
    if set(body.ordered_ids) != set(by_id):
        raise HTTPException(
            status_code=422, detail="ordered_ids must list exactly this project's rules"
        )
    for position, rule_id in enumerate(body.ordered_ids):
        by_id[rule_id].position = position
    await session.commit()
    ordered = (
        (
            await session.execute(
                select(AutomationRule)
                .where(AutomationRule.project_id == project_id)
                .order_by(
                    AutomationRule.position.asc(),
                    AutomationRule.created_at.asc(),
                    AutomationRule.id.asc(),
                )
            )
        )
        .scalars()
        .all()
    )
    return AutomationRuleList(
        items=[AutomationRuleRead.model_validate(r) for r in ordered], total=len(ordered)
    )


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
    dumped = body.model_dump(exclude_unset=True)
    cond_keys = {"condition_field", "condition_value"}
    # Non-condition fields keep the "None means keep current" convention (v13.1).
    provided = {k: v for k, v in dumped.items() if v is not None and k not in cond_keys}
    # Condition pair (Pass 81): explicit presence of EITHER side replaces the
    # whole pair — this is how a condition is cleared (send both null) or set
    # (send both). Absent side defaults to null; the merged Create then enforces
    # both-or-neither, so setting only one side 422s.
    if cond_keys & dumped.keys():
        provided["condition_field"] = dumped.get("condition_field")
        provided["condition_value"] = dumped.get("condition_value")
    # Validate the MERGED rule with the same fan-in as create (v13.1 R1-③) —
    # a partial edit can never leave the trigger/action pair invalid.
    merged = {
        "name": rule.name,
        "trigger_type": rule.trigger_type,
        "trigger_value": rule.trigger_value,
        "action_type": rule.action_type,
        "action_value": rule.action_value,
        "condition_field": rule.condition_field,
        "condition_value": rule.condition_value,
        "is_active": rule.is_active,
        **provided,
    }
    try:
        merged_rule = AutomationRuleCreate(**merged)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()[0]["msg"]) from exc
    await _require_assignee_value_member(session, project_id, merged_rule)
    type_binding_changed = (
        (rule.trigger_type == "type_changed_to" and "trigger_value" in provided)
        or bool(cond_keys & dumped.keys())
        or (provided.get("is_active") is True and not rule.is_active)
    )
    if type_binding_changed:
        await _require_active_rule_types(session, project_id, merged_rule)
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
