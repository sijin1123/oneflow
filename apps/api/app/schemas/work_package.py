import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.work_package import WP_PRIORITIES, WP_STATUSES, WP_TYPES
from app.schemas.custom_field import CustomValueRead

MAX_DESCRIPTION = 20_000


def _check_dates(start: date | None, due: date | None) -> None:
    if start is not None and due is not None and start > due:
        raise ValueError("start_date must be <= due_date")


def _check_hours(v: float | None) -> float | None:
    if v is not None and not 0 <= v <= 1000:
        raise ValueError("estimated_hours must be between 0 and 1000")
    return v


class WorkPackageCreate(BaseModel):
    subject: str
    description: str | None = None
    type: str = "task"
    status: str = "backlog"
    priority: str = "none"
    assignee_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    cycle_id: uuid.UUID | None = None
    module_id: uuid.UUID | None = None
    start_date: date | None = None
    due_date: date | None = None
    estimated_hours: float | None = None

    @field_validator("estimated_hours")
    @classmethod
    def _est(cls, v: float | None) -> float | None:
        return _check_hours(v)

    @field_validator("subject")
    @classmethod
    def _subject(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 255:
            raise ValueError("subject must be 1-255 chars after trim")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v: str | None) -> str | None:
        if v is not None and len(v) > MAX_DESCRIPTION:
            raise ValueError(f"description exceeds {MAX_DESCRIPTION} chars")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        if v not in WP_TYPES:
            raise ValueError(f"type must be one of {WP_TYPES}")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in WP_STATUSES:
            raise ValueError(f"status must be one of {WP_STATUSES}")
        return v

    @field_validator("priority")
    @classmethod
    def _priority(cls, v: str) -> str:
        if v not in WP_PRIORITIES:
            raise ValueError(f"priority must be one of {WP_PRIORITIES}")
        return v

    @model_validator(mode="after")
    def _dates(self) -> "WorkPackageCreate":
        _check_dates(self.start_date, self.due_date)
        return self


class WorkPackagePatch(BaseModel):
    """Partial update. Explicit null on nullable fields = clear; omitted = unchanged.
    subject/status/priority/type reject null (enforced in the endpoint via
    model_fields_set). expected_version is the optimistic-concurrency token (§6.2)."""

    expected_version: int
    subject: str | None = None
    description: str | None = None
    type: str | None = None
    status: str | None = None
    priority: str | None = None
    assignee_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    cycle_id: uuid.UUID | None = None
    module_id: uuid.UUID | None = None
    start_date: date | None = None
    due_date: date | None = None
    estimated_hours: float | None = None

    @field_validator("estimated_hours")
    @classmethod
    def _est(cls, v: float | None) -> float | None:
        return _check_hours(v)

    @field_validator("expected_version")
    @classmethod
    def _version(cls, v: int) -> int:
        # int4 column bounds: out-of-range tokens are a client error (422),
        # never an asyncpg bind failure surfacing as 500 (review finding #7).
        if not 0 <= v <= 2_147_483_647:
            raise ValueError("expected_version must be between 0 and 2147483647")
        return v

    @field_validator("subject")
    @classmethod
    def _subject(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not 1 <= len(v) <= 255:
            raise ValueError("subject must be 1-255 chars after trim")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v: str | None) -> str | None:
        if v is not None and len(v) > MAX_DESCRIPTION:
            raise ValueError(f"description exceeds {MAX_DESCRIPTION} chars")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v: str | None) -> str | None:
        if v is not None and v not in WP_TYPES:
            raise ValueError(f"type must be one of {WP_TYPES}")
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


class WorkPackageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    subject: str
    description: str | None
    type: str
    status: str
    priority: str
    assignee_id: uuid.UUID | None
    parent_id: uuid.UUID | None
    milestone_id: uuid.UUID | None
    customer_id: uuid.UUID | None
    cycle_id: uuid.UUID | None
    module_id: uuid.UUID | None
    start_date: date | None
    due_date: date | None
    estimated_hours: float | None
    created_by: uuid.UUID | None
    version: int
    created_at: datetime
    updated_at: datetime
    # Batch custom-field values (Pass 67): populated ONLY when the list is
    # requested with `custom_fields=` — None otherwise (additive optional).
    custom_values: list[CustomValueRead] | None = None


class WorkPackageList(BaseModel):
    items: list[WorkPackageRead]
    total: int


class BulkPatch(BaseModel):
    """Uniform patch for bulk-update — simple assignments only (v12.1: the
    deliberate §6.2 exception; drawer precision edits keep the version token)."""

    status: str | None = None
    assignee_id: uuid.UUID | None = None
    priority: str | None = None

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


class BulkUpdateRequest(BaseModel):
    ids: list[uuid.UUID]
    patch: BulkPatch

    @field_validator("ids")
    @classmethod
    def _ids(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        deduped = list(dict.fromkeys(v))
        if not 1 <= len(deduped) <= 100:
            raise ValueError("ids must contain 1-100 unique work package ids")
        return deduped


class BulkUpdateResult(BaseModel):
    """skipped_ids is deliberately opaque (missing / cross-project / whatever —
    existence hiding, v12.1 R1-③); unchanged rows are reported, not re-written."""

    updated_ids: list[uuid.UUID]
    unchanged_ids: list[uuid.UUID]
    skipped_ids: list[uuid.UUID]


class WorkPackageDuplicateResult(BaseModel):
    """Duplicate response: the new WP plus how many custom values did NOT copy
    (inactive/unbound field, stale option or ex-member value — v12.1 R1-④)."""

    work_package: WorkPackageRead
    skipped_custom_values: int


class RelationCreate(BaseModel):
    target_id: uuid.UUID
    relation_type: str

    @field_validator("relation_type")
    @classmethod
    def _rt(cls, v: str) -> str:
        from app.models.relation import RELATION_TYPES

        if v not in RELATION_TYPES:
            raise ValueError(f"relation_type must be one of {RELATION_TYPES}")
        return v


class RelationRead(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    target_id: uuid.UUID
    relation_type: str
    direction: str  # "outgoing" | "incoming"


class RelationList(BaseModel):
    items: list[RelationRead]
    total: int


class ProjectRelationRead(BaseModel):
    """Project-wide relation row — absolute source/target (no caller-relative
    direction). Feeds the timeline dependency connectors (Pass 20)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_id: uuid.UUID
    target_id: uuid.UUID
    relation_type: str


class ProjectRelationList(BaseModel):
    items: list[ProjectRelationRead]
    total: int
    truncated: bool


class ConflictResponse(BaseModel):
    """409 body for PATCH optimistic-concurrency conflicts (§6.1 single contract)."""

    detail: str
    current: WorkPackageRead


class MoveRefSummary(BaseModel):
    """One cleared-reference category of a cross-project move: count plus the
    first few names so the preview is meaningful, never just a number."""

    count: int = 0
    names: list[str] = []
    overflow: int = 0


class MoveCleared(BaseModel):
    parent: bool
    children: MoveRefSummary
    milestone: bool
    cycle: bool
    module: bool
    relations: MoveRefSummary
    custom_values: MoveRefSummary
    document_links: MoveRefSummary
    watchers_removed: MoveRefSummary
    assignee_cleared: bool


class WorkPackageMove(BaseModel):
    target_project_id: uuid.UUID
    expected_version: int
    dry_run: bool = False


class WorkPackageMoveResult(BaseModel):
    """dry_run=True returns the SAME cleared summary with work_package=None
    and no state change (v66.1 R1-④)."""

    work_package: WorkPackageRead | None
    cleared: MoveCleared
    dry_run: bool
