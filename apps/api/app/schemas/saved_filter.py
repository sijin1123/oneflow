import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.models.work_package import WP_PRIORITIES, WP_STATUSES, WP_TYPES

# Canonical order of configurable list columns. Subject and the selection
# checkbox are always shown and never appear here. Display-only: the list
# endpoint does not consume `columns`; the client renders from it.
LIST_COLUMNS = ("type", "status", "priority", "assignee", "start_date", "due_date", "created_at")


class SavedFilterParams(BaseModel):
    """The subset of the list query a filter can capture. Enum values are validated
    so a saved filter can never carry a status the list endpoint would 422 on."""

    status: str | None = None
    priority: str | None = None
    type: str | None = None
    assignee_id: str | None = None
    cycle_id: str | None = None
    module_id: str | None = None
    q: str | None = None
    columns: str | None = None

    @field_validator("assignee_id", "cycle_id", "module_id")
    @classmethod
    def _uuid_like(cls, v: str | None) -> str | None:
        if v is None:
            return v
        uuid.UUID(v)  # raises ValueError → 422 on malformed ids
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in WP_STATUSES:
            raise ValueError(f"status must be one of {WP_STATUSES}")
        return v

    @field_validator("priority")
    @classmethod
    def _priority(cls, v: str | None) -> str | None:
        if v is not None and v not in WP_PRIORITIES:
            raise ValueError(f"priority must be one of {WP_PRIORITIES}")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v: str | None) -> str | None:
        if v is not None and v not in WP_TYPES:
            raise ValueError(f"type must be one of {WP_TYPES}")
        return v

    @field_validator("q")
    @classmethod
    def _q(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                return None
            if len(v) > 255:
                raise ValueError("q must be <= 255 chars")
        return v

    @field_validator("columns")
    @classmethod
    def _columns(cls, v: str | None) -> str | None:
        """Comma-separated closed vocabulary, normalized to canonical order.

        Unknown keys are a 422 (a saved view must never carry a column the list
        cannot render); duplicates collapse; an empty result stores None so the
        client falls back to its default column set."""
        if v is None:
            return v
        keys = [k.strip() for k in v.split(",") if k.strip()]
        unknown = [k for k in keys if k not in LIST_COLUMNS]
        if unknown:
            raise ValueError(f"columns must be a subset of {LIST_COLUMNS}")
        wanted = set(keys)
        normalized = [k for k in LIST_COLUMNS if k in wanted]
        return ",".join(normalized) if normalized else None


VIEW_LAYOUTS = ("list", "board", "tree", "timeline", "calendar")
VIEW_SORTS = ("created", "subject")


def _check_layout(v: str) -> str:
    if v not in VIEW_LAYOUTS:
        raise ValueError(f"layout must be one of {VIEW_LAYOUTS}")
    return v


class SavedFilterCreate(BaseModel):
    name: str
    params: SavedFilterParams = SavedFilterParams()
    layout: str = "list"
    sort: str | None = None
    is_shared: bool = False

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 80:
            raise ValueError("name must be 1-80 chars after trim")
        return v

    @field_validator("layout")
    @classmethod
    def _layout(cls, v: str) -> str:
        return _check_layout(v)

    @field_validator("sort")
    @classmethod
    def _sort(cls, v: str | None) -> str | None:
        if v is not None and v not in VIEW_SORTS:
            raise ValueError(f"sort must be one of {VIEW_SORTS}")
        return v


class SavedFilterUpdate(BaseModel):
    """Author-only partial update (rename, relayout, share toggle)."""

    name: str | None = None
    layout: str | None = None
    sort: str | None = None
    is_shared: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not 1 <= len(v) <= 80:
            raise ValueError("name must be 1-80 chars after trim")
        return v

    @field_validator("layout")
    @classmethod
    def _layout(cls, v: str | None) -> str | None:
        return None if v is None else _check_layout(v)

    @field_validator("sort")
    @classmethod
    def _sort(cls, v: str | None) -> str | None:
        if v is not None and v not in VIEW_SORTS:
            raise ValueError(f"sort must be one of {VIEW_SORTS}")
        return v


class SavedFilterRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    params: SavedFilterParams
    layout: str
    sort: str | None
    is_shared: bool
    # Authorship for the UI: shared views show who owns them; edits are
    # author-only, so the client hides controls when is_mine is False.
    is_mine: bool
    owner_name: str
    created_at: datetime


class SavedFilterList(BaseModel):
    items: list[SavedFilterRead]
    total: int
