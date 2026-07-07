import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

MAX_COMMENT = 20_000


MAX_MENTIONS = 20


class CommentCreate(BaseModel):
    body: str
    # Single-level threading: must reference a ROOT comment on the same WP.
    parent_id: uuid.UUID | None = None
    # Mentions are structured data, not body @-parsing (PLAN v10.1 R1-②): the
    # server keeps members only and persists the ACCEPTED set on the comment.
    mentioned_user_ids: list[uuid.UUID] = []

    @field_validator("body")
    @classmethod
    def _body(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= MAX_COMMENT:
            raise ValueError(f"comment body must be 1-{MAX_COMMENT} chars after trim")
        return v

    @field_validator("mentioned_user_ids")
    @classmethod
    def _mentions(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        deduped = list(dict.fromkeys(v))
        if len(deduped) > MAX_MENTIONS:
            raise ValueError(f"at most {MAX_MENTIONS} mentions per comment")
        return deduped


class ReactionAgg(BaseModel):
    """One emoji aggregate. The set is OPEN (Pass 35): only emojis with at
    least one reaction appear, sorted by count desc then codepoint asc —
    clients own the quick-pick set."""

    key: str
    count: int
    me: bool


def empty_reactions() -> list[ReactionAgg]:
    return []


class ReactionList(BaseModel):
    items: list[ReactionAgg]


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    work_package_id: uuid.UUID
    parent_id: uuid.UUID | None
    author_id: uuid.UUID | None
    body: str
    # Accepted mentions (member-validated at create time) — null means none.
    mentions: list[uuid.UUID] | None
    reactions: list[ReactionAgg] = []
    created_at: datetime
    updated_at: datetime


class CommentList(BaseModel):
    items: list[CommentRead]
    total: int


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    work_package_id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    field: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime


class ActivityList(BaseModel):
    items: list[ActivityRead]
    total: int


class ProjectActivityRead(BaseModel):
    """Activity enriched with the work package subject and actor name, for the
    project-wide audit feed."""

    id: uuid.UUID
    work_package_id: uuid.UUID
    work_package_subject: str
    # Exposed as stored (Pass 38) — identical to the WP activity read; the
    # name is the display value, the id is the filter value.
    actor_id: uuid.UUID | None
    actor_name: str | None
    action: str
    field: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime


class ProjectActivityList(BaseModel):
    """`total` is the RETURNED count (legacy contract — documented, v19.1);
    `truncated` reports more rows beyond the limit (limit+1 probe)."""

    items: list[ProjectActivityRead]
    total: int
    truncated: bool = False
