from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

ProjectPhaseKey = Literal["discover", "plan", "deliver", "close"]
ProjectPhaseColor = Literal["sky", "indigo", "emerald", "amber"]


class ProjectPhaseRead(BaseModel):
    key: ProjectPhaseKey
    name: str
    color: ProjectPhaseColor
    position: int
    active: bool
    start_date: date | None
    end_date: date | None
    version: int


class ProjectPhaseList(BaseModel):
    items: list[ProjectPhaseRead]
    total: int


class ProjectPhasePatch(BaseModel):
    """Omitted fields remain unchanged; an explicit null clears a date."""

    active: bool | None = None
    start_date: date | None = None
    end_date: date | None = None
    version: int = Field(ge=0, le=2_147_483_647)
