"""Automation engine (PLAN §3 Phase 3 자동화, reshaped in Pass 16 v16.1).

Candidate computation is SIDE-EFFECT FREE: `change_candidates` returns the
winning candidate per field for the fired trigger set; the CALLER applies
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

from sqlalchemy import and_ as sa_and
from sqlalchemy import func, select, update
from sqlalchemy import or_ as sa_or
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import member_role
from app.models.automation_rule import AutomationRule, AutomationRuleRun


@dataclass(frozen=True)
class AutomationCandidate:
    rule_id: uuid.UUID
    rule_name: str
    field: str
    # str for vocabulary fields (priority), uuid.UUID for assignee — typed so
    # the caller's setdefault feeds the UPDATE the right bind type.
    value: object


async def change_candidates(
    session: AsyncSession,
    project_id: uuid.UUID,
    fired: dict[str, str],
) -> dict[str, AutomationCandidate]:
    """Winning candidate per target field for the USER-initiated changes in
    `fired` — a {trigger_type: new_value} map built ONLY from real (old≠new)
    changes (v41.1 R1-②; a no-op field never fires).

    Pure computation — no counters, no log rows. Rules from ALL fired
    triggers merge into ONE global order (created_at asc, id asc — no
    inter-trigger precedence, v41.1 R1-⑤); the LAST rule per field wins
    (reduced in memory, so a multi-rule pile-up can never emit intermediate
    values downstream). Single-pass stays intact: candidates come only from
    the user's change, so priority_changed_to + set_priority cannot chain."""
    if not fired:
        return {}
    match = sa_or(
        *[
            sa_and(
                AutomationRule.trigger_type == trigger_type,
                AutomationRule.trigger_value == value,
            )
            for trigger_type, value in fired.items()
        ]
    )
    rules = (
        (
            await session.execute(
                select(AutomationRule)
                .where(
                    AutomationRule.project_id == project_id,
                    AutomationRule.is_active.is_(True),
                    match,
                )
                .order_by(AutomationRule.created_at.asc(), AutomationRule.id.asc())
            )
        )
        .scalars()
        .all()
    )
    candidates: dict[str, AutomationCandidate] = {}
    for rule in rules:
        # Every action writes a field OTHER than status, so a rule can never
        # re-trigger itself or another status rule.
        if rule.action_type == "set_priority":
            candidates["priority"] = AutomationCandidate(
                rule_id=rule.id, rule_name=rule.name, field="priority", value=rule.action_value
            )
        elif rule.action_type == "set_assignee":
            candidates["assignee_id"] = AutomationCandidate(
                rule_id=rule.id,
                rule_name=rule.name,
                field="assignee_id",
                value=uuid.UUID(rule.action_value),
            )
    # Fire-time recheck (v16.1 R1-④, v61.1 R1-⑥): the WINNING assignee must
    # still be a member with a writable role — the same predicate the ordinary
    # assignee fan-in uses. A stale rule (member left or was demoted to viewer
    # after the rule was saved) skips the FIELD, silently: no apply, no run,
    # no fired (never assign an ex-member or a read-only viewer).
    winner = candidates.get("assignee_id")
    if winner is not None:
        role = await member_role(session, project_id, winner.value)
        if role is None or role == "viewer":
            del candidates["assignee_id"]
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
