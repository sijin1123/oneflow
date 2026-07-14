"""Shared health-report transition (v37.1 table; Pass 44 extracted).

PURE payload transition only — authorization, history, visibility, and display-name
resolution stay in each domain router (v44.1 R1-③). Concurrency is
last-write-wins by design; the caller may persist the resulting transition.
The always-replaced note keeps a stale reason from lingering."""

import uuid

from fastapi import HTTPException
from sqlalchemy import func

HEALTH_FIELDS = ("health", "health_note", "health_updated_by", "health_updated_at")


def apply_health_patch(target, fields: dict, actor_id: uuid.UUID) -> None:
    """Consume health/health_note from `fields` and apply the v37.1 table:
    omitted → untouched (a standalone note is 422); a VALUE sets it and
    ALWAYS replaces the note (omitted → null) with an actor/time stamp;
    null clears everything (a note alongside is contradictory → 422)."""
    if "health" in fields:
        health = fields.pop("health")
        note = fields.pop("health_note", None)
        if health is None:
            if note is not None:
                raise HTTPException(status_code=422, detail="health_note requires a health value")
            target.health = None
            target.health_note = None
            target.health_updated_by = None
            target.health_updated_at = None
        else:
            target.health = health
            target.health_note = note  # always replaced (null when omitted)
            target.health_updated_by = actor_id
            target.health_updated_at = func.now()
    elif "health_note" in fields:
        raise HTTPException(status_code=422, detail="health_note requires a health value")
