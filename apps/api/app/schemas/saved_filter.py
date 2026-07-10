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
    milestone_id: str | None = None
    cycle_id: str | None = None
    module_id: str | None = None
    q: str | None = None
    columns: str | None = None
    # Custom-field filter (Pass 80): cf_field uuid + cf_op eq|has (+ cf_value
    # only meaningful for eq; the client drops it for has, v80.1 R1-②).
    cf_field: str | None = None
    cf_op: str | None = None
    cf_value: str | None = None

    @field_validator("cf_op")
    @classmethod
    def _cf_op(cls, v: str | None) -> str | None:
        if v is not None and v not in ("eq", "has"):
            raise ValueError("cf_op must be 'eq' or 'has'")
        return v

    @field_validator("assignee_id", "milestone_id", "cycle_id", "module_id", "cf_field")
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
        """Comma-separated vocabulary, normalized: built-in keys collapse to
        canonical order; `custom:<uuid>` keys (Pass 67) keep request order
        AFTER the built-ins, capped at five (v67.1 R1-①). Existence of the
        field is a render-time concern (the web canonicalizer drops columns
        whose definition is gone), not a save-time one."""
        if v is None:
            return v
        keys = [k.strip() for k in v.split(",") if k.strip()]
        custom: list[str] = []
        builtin: set[str] = set()
        for k in keys:
            if k in LIST_COLUMNS:
                builtin.add(k)
                continue
            if k.startswith("custom:"):
                try:
                    fid = str(uuid.UUID(k.removeprefix("custom:")))
                except ValueError:
                    raise ValueError("custom column keys must be custom:<uuid>") from None
                key = f"custom:{fid}"
                if key not in custom:
                    custom.append(key)
                continue
            raise ValueError(f"columns must be built-in keys {LIST_COLUMNS} or custom:<uuid>")
        if len(custom) > 5:
            raise ValueError("at most 5 custom columns per view")
        normalized = [k for k in LIST_COLUMNS if k in builtin] + custom
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
    """Author-only partial update (rename, relayout, share/lock toggles).
    A LOCKED view only accepts the single-field unlock (v54.1 R1-⑤)."""

    name: str | None = None
    layout: str | None = None
    sort: str | None = None
    is_shared: bool | None = None
    is_locked: bool | None = None

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
    is_locked: bool
    # Authorship for the UI: shared views show who owns them; edits are
    # author-only, so the client hides controls when is_mine is False.
    is_mine: bool
    owner_name: str
    created_at: datetime


class SavedFilterList(BaseModel):
    items: list[SavedFilterRead]
    total: int
