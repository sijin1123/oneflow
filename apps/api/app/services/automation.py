"""Automation engine (PLAN §3 Phase 3 자동화).

Evaluated inside the work-package PATCH transaction. Single-pass by design: it
returns the extra field writes implied by active rules for the user's change; those
writes are NOT fed back through the rules, so a rule can never cascade or loop.
"""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation_rule import AutomationRule


async def extra_changes_for_status(
    session: AsyncSession,
    project_id: uuid.UUID,
    new_status: str,
) -> dict:
    """Field writes triggered by a status becoming `new_status`.

    Only fills fields the caller did not set explicitly (the caller merges the
    result without overriding user input)."""
    rules = (
        (
            await session.execute(
                select(AutomationRule)
                .where(
                    AutomationRule.project_id == project_id,
                    AutomationRule.is_active.is_(True),
                    AutomationRule.trigger_type == "status_changed_to",
                    AutomationRule.trigger_value == new_status,
                )
                # Deterministic precedence: with several rules on the same status the
                # most recently created one wins. Without ORDER BY the winner depended
                # on physical row order (fable5 audit: nondeterministic automation).
                .order_by(AutomationRule.created_at.asc(), AutomationRule.id.asc())
            )
        )
        .scalars()
        .all()
    )
    extra: dict = {}
    winners: dict[str, uuid.UUID] = {}  # field -> winning rule id
    for rule in rules:
        if rule.action_type == "set_priority":
            # Trigger watches status, action writes priority — never the same field,
            # so this can't re-trigger the same or another status rule. Rules are
            # reduced IN MEMORY to the final value per field (v13.1 R1-④).
            extra["priority"] = rule.action_value
            winners["priority"] = rule.id
    # Fire audit (v13.1 R1-①): "fired" = selected as the field's winning rule at
    # evaluation time. Atomic UPDATE in the caller's transaction — the counter
    # commits or rolls back together with the change that fired the rule.
    if winners:
        await session.execute(
            update(AutomationRule)
            .where(AutomationRule.id.in_(set(winners.values())))
            .values(fired_count=AutomationRule.fired_count + 1, last_fired_at=func.now())
        )
    return extra
