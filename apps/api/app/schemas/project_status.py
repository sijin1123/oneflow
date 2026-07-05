import uuid

from pydantic import BaseModel, ConfigDict, field_validator


class ProjectStatusRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    key: str
    name: str
    position: int


class ProjectStatusList(BaseModel):
    items: list[ProjectStatusRead]
    total: int


class ProjectStatusReorder(BaseModel):
    """Atomic reorder: the full list of status ids in the desired order. Applying
    all positions in one transaction avoids the corrupt duplicate-position state a
    two-independent-PATCH swap could leave behind (fable5 audit)."""

    ordered_ids: list[uuid.UUID]

    @field_validator("ordered_ids")
    @classmethod
    def _non_empty(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if not v:
            raise ValueError("ordered_ids must not be empty")
        if len(v) != len(set(v)):
            raise ValueError("ordered_ids must not contain duplicates")
        return v


class ProjectStatusUpdate(BaseModel):
    """Rename and/or reorder a status. Keys are fixed (they identify stored work
    package statuses), so only the label and position are editable."""

    name: str | None = None
    position: int | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not 1 <= len(v) <= 40:
            raise ValueError("name must be 1-40 chars after trim")
        return v

    @field_validator("position")
    @classmethod
    def _position(cls, v: int | None) -> int | None:
        if v is not None and not 0 <= v <= 999:
            raise ValueError("position must be between 0 and 999")
        return v
