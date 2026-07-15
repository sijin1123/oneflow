import uuid

from app.models.workspace_profile import (
    MAX_ACTIVE_PROJECT_PHASES,
    MAX_PROJECT_PHASE_DEFINITIONS,
    PROJECT_PHASE_KEYS,
)
from app.schemas.workspace_profile import (
    WorkspaceProjectPhaseDefinitionCreate,
    WorkspaceProjectPhaseDefinitionsStored,
    WorkspaceProjectPhaseDefinitionStored,
    WorkspaceProjectPhaseDefinitionsUpdate,
)


def parse_phase_definitions(raw: object) -> list[WorkspaceProjectPhaseDefinitionStored]:
    return WorkspaceProjectPhaseDefinitionsStored.model_validate({"items": raw}).items


def serialize_phase_definitions(
    items: list[WorkspaceProjectPhaseDefinitionStored],
) -> list[dict[str, str | bool]]:
    return [item.model_dump() for item in items]


def update_phase_definitions(
    current: list[WorkspaceProjectPhaseDefinitionStored],
    body: WorkspaceProjectPhaseDefinitionsUpdate,
) -> list[WorkspaceProjectPhaseDefinitionStored]:
    current_by_key = {item.key: item for item in current}
    requested_keys = {item.key for item in body.items}
    if requested_keys != set(current_by_key):
        raise ValueError("items must contain every current phase key exactly once")
    updated = [
        WorkspaceProjectPhaseDefinitionStored(
            **item.model_dump(),
            retired=current_by_key[item.key].retired,
        )
        for item in body.items
    ]
    return WorkspaceProjectPhaseDefinitionsStored(items=updated).items


def create_phase_definition(
    current: list[WorkspaceProjectPhaseDefinitionStored],
    body: WorkspaceProjectPhaseDefinitionCreate,
) -> list[WorkspaceProjectPhaseDefinitionStored]:
    if len(current) >= MAX_PROJECT_PHASE_DEFINITIONS:
        raise ValueError(f"phase definitions cannot exceed {MAX_PROJECT_PHASE_DEFINITIONS}")
    if sum(not item.retired for item in current) >= MAX_ACTIVE_PROJECT_PHASES:
        raise ValueError(f"active phases cannot exceed {MAX_ACTIVE_PROJECT_PHASES}")
    if body.name.casefold() in {item.name.casefold() for item in current}:
        raise ValueError("phase names must be unique ignoring case")
    existing_keys = {item.key for item in current}
    key = f"custom_{uuid.uuid4().hex}"
    while key in existing_keys:
        key = f"custom_{uuid.uuid4().hex}"
    created = WorkspaceProjectPhaseDefinitionStored(
        key=key,
        name=body.name,
        color=body.color,
        retired=False,
    )
    first_retired = next(
        (index for index, item in enumerate(current) if item.retired), len(current)
    )
    updated = [*current[:first_retired], created, *current[first_retired:]]
    return WorkspaceProjectPhaseDefinitionsStored(items=updated).items


def set_phase_retired(
    current: list[WorkspaceProjectPhaseDefinitionStored],
    phase_key: str,
    *,
    retired: bool,
) -> list[WorkspaceProjectPhaseDefinitionStored]:
    by_key = {item.key: item for item in current}
    target = by_key.get(phase_key)
    if target is None:
        raise KeyError(phase_key)
    if phase_key in PROJECT_PHASE_KEYS:
        raise ValueError("built-in phases cannot be retired")
    if target.retired == retired:
        return current
    if not retired and sum(not item.retired for item in current) >= MAX_ACTIVE_PROJECT_PHASES:
        raise ValueError(f"active phases cannot exceed {MAX_ACTIVE_PROJECT_PHASES}")
    changed = target.model_copy(update={"retired": retired})
    remaining = [item for item in current if item.key != phase_key]
    if retired:
        updated = [*remaining, changed]
    else:
        first_retired = next(
            (index for index, item in enumerate(remaining) if item.retired), len(remaining)
        )
        updated = [*remaining[:first_retired], changed, *remaining[first_retired:]]
    return WorkspaceProjectPhaseDefinitionsStored(items=updated).items
