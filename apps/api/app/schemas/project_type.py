import uuid

from pydantic import BaseModel, ConfigDict, field_validator


class ProjectTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    key: str
    name: str
    position: int
    is_active: bool


class ProjectTypeList(BaseModel):
    items: list[ProjectTypeRead]
    total: int


class ProjectTypeUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not 1 <= len(v) <= 40:
            raise ValueError("name must be 1-40 chars after trim")
        return v


class ProjectTypeReorder(BaseModel):
    ordered_ids: list[uuid.UUID]
