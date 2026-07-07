import uuid
from datetime import date

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
    due_date: date | None


class SearchResults(BaseModel):
    items: list[SearchResultItem]
    total: int
    query: str


class SearchDocumentItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_key: str
    project_name: str
    title: str


class SearchMeetingItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_key: str
    project_name: str
    title: str
    scheduled_on: date | None


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


class UnifiedSearchResults(BaseModel):
    """Grouped workspace search (Pass 14, v14.1). `returned` is the RETURNED
    count; `truncated` means more hits exist beyond the per-group cap (computed
    by a limit+1 fetch — never a silent cut)."""

    query: str
    work_packages: WpGroup
    documents: DocumentGroup
    meetings: MeetingGroup
    cycles: NamedGroup
    modules: NamedGroup
    initiatives: InitiativeGroup
