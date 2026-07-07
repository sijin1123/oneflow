"""Automation engine (PLAN §3 Phase 3 자동화, reshaped in Pass 16 v16.1).

Candidate computation is SIDE-EFFECT FREE: `status_change_candidates` returns
the winning candidate per field for a status transition; the CALLER applies
them (user-set fields win via setdefault), and only ACTUALLY APPLIED changes
are recorded — `record_applied` inserts the per-WP execution-log row and
`bump_fired` updates the counters atomically, both in the applying transaction.
Single-pass by design: automated writes are never fed back through the rules.

Case semantics (v16.1 R1-③): no candidate / user override / no-op equal value /
fire-time validation failure / conditional-update miss → NO fired, NO run.
Applied change → fired+1, run row (and the ordinary notification path for the
field, e.g. record_assignment for assignee).
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation_rule import AutomationRule, AutomationRuleRun


@dataclass(frozen=True)
class AutomationCandidate:
    rule_id: uuid.UUID
    rule_name: str
    field: str
    value: str


async def status_change_candidates(
    session: AsyncSession,
    project_id: uuid.UUID,
    new_status: str,
) -> dict[str, AutomationCandidate]:
    """Winning candidate per target field for a status becoming `new_status`.

    Pure computation — no counters, no log rows. Deterministic precedence:
    created_at asc, the LAST rule per field wins (reduced in memory, so a
    multi-rule pile-up can never emit intermediate values downstream)."""
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
                .order_by(AutomationRule.created_at.asc(), AutomationRule.id.asc())
            )
        )
        .scalars()
        .all()
    )
    candidates: dict[str, AutomationCandidate] = {}
    for rule in rules:
        if rule.action_type == "set_priority":
            # Trigger watches status, action writes priority — never the same
            # field, so this can't re-trigger the same or another status rule.
            candidates["priority"] = AutomationCandidate(
                rule_id=rule.id, rule_name=rule.name, field="priority", value=rule.action_value
            )
    return candidates


def record_applied(
    session: AsyncSession,
    *,
    candidate: AutomationCandidate,
    project_id: uuid.UUID,
    wp_id: uuid.UUID,
    wp_subject: str,
    actor_id: uuid.UUID,
    old_value: object,
    new_value: object,
) -> None:
    """Log one ACTUALLY APPLIED automation change (v16.1: fired = run = applied).
    Caller invokes this only after its conditional UPDATE succeeded; the row
    rides that transaction and rolls back with it."""
    session.add(
        AutomationRuleRun(
            project_id=project_id,
            rule_id=candidate.rule_id,
            rule_name=candidate.rule_name,
            work_package_id=wp_id,
            work_package_subject=wp_subject,
            field=candidate.field,
            old_value=None if old_value is None else str(old_value),
            new_value=None if new_value is None else str(new_value),
            actor_id=actor_id,
        )
    )


async def bump_fired(session: AsyncSession, rule_ids: set[uuid.UUID]) -> None:
    """Atomic fired counters for the given rules — read-modify-write forbidden."""
    if not rule_ids:
        return
    await session.execute(
        update(AutomationRule)
        .where(AutomationRule.id.in_(rule_ids))
        .values(fired_count=AutomationRule.fired_count + 1, last_fired_at=func.now())
    )
