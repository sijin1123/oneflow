import uuid
from datetime import date, datetime

from pydantic import BaseModel


class SearchResultItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_key: str
    project_name: str
    subject: str
    status: str
    priority: str
    type: str
    assignee_id: uuid.UUID | None = None
    assignee_name: str | None = None
    start_date: date | None = None
    due_date: date | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    version: int = 0
    current_user_can_write: bool = False
    # Content search (Pass 39): "primary" = the UI's main label (subject/
    # title/name); a primary match wins when both match (snippet stays null).
    matched_in: str = "primary"
    snippet: str | None = None


class SearchResults(BaseModel):
    items: list[SearchResultItem]
    total: int
    query: str


class SearchAnalyticsBucket(BaseModel):
    key: str
    count: int


class SearchAnalyticsProject(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    count: int


class SearchAnalyticsProjectOverflow(BaseModel):
    project_count: int
    item_count: int


class SearchAnalyticsScheduleBuckets(BaseModel):
    completed: int
    open_overdue: int
    open_due_next_7_days: int
    open_later: int
    open_unscheduled: int


class SearchWorkPackageAnalytics(BaseModel):
    total: int
    status_buckets: list[SearchAnalyticsBucket]
    priority_buckets: list[SearchAnalyticsBucket]
    top_projects: list[SearchAnalyticsProject]
    project_overflow: SearchAnalyticsProjectOverflow
    schedule_buckets: SearchAnalyticsScheduleBuckets


class SearchDocumentItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_key: str
    project_name: str
    title: str
    matched_in: str = "primary"
    snippet: str | None = None


class SearchMeetingItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_key: str
    project_name: str
    title: str
    scheduled_on: date | None
    matched_in: str = "primary"
    snippet: str | None = None


class SearchNamedItem(BaseModel):
    """Cycles and modules — matched by name within member projects."""

    id: uuid.UUID
    project_id: uuid.UUID
    project_key: str
    project_name: str
    name: str


class SearchInitiativeItem(BaseModel):
    id: uuid.UUID
    name: str
    state: str


class SearchFileItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_key: str
    project_name: str
    filename: str
    content_type: str | None
    size_bytes: int | None
    matched_in: str = "primary"
    snippet: str | None = None


class WpGroup(BaseModel):
    items: list[SearchResultItem]
    returned: int
    truncated: bool


class DocumentGroup(BaseModel):
    items: list[SearchDocumentItem]
    returned: int
    truncated: bool


class MeetingGroup(BaseModel):
    items: list[SearchMeetingItem]
    returned: int
    truncated: bool


class NamedGroup(BaseModel):
    items: list[SearchNamedItem]
    returned: int
    truncated: bool


class InitiativeGroup(BaseModel):
    items: list[SearchInitiativeItem]
    returned: int
    truncated: bool


class FileGroup(BaseModel):
    items: list[SearchFileItem]
    returned: int
    truncated: bool


class UnifiedSearchResults(BaseModel):
    """Grouped workspace search (Pass 14, v14.1). `returned` is the RETURNED
    count; `truncated` means more hits exist beyond the per-group cap (computed
    by a limit+1 fetch — never a silent cut)."""

    query: str
    work_packages: WpGroup
    documents: DocumentGroup
    files: FileGroup
    meetings: MeetingGroup
    cycles: NamedGroup
    modules: NamedGroup
    initiatives: InitiativeGroup
