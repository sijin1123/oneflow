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
