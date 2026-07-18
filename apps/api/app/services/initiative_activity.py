import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.initiative import InitiativeActivity


def record_initiative_activity(
    session: AsyncSession,
    *,
    initiative_id: uuid.UUID,
    actor_id: uuid.UUID,
    kind: str,
    changed_fields: set[str] | tuple[str, ...] = (),
) -> None:
    """Stage one safe history event in the caller's mutation transaction."""

    session.add(
        InitiativeActivity(
            initiative_id=initiative_id,
            actor_id=actor_id,
            kind=kind,
            changed_fields=sorted(changed_fields),
        )
    )
