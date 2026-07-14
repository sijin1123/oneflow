from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ProjectDirectoryColumn = Literal[
    "initiatives",
    "work_package_count",
    "open_work_package_count",
    "overdue_count",
    "member_count",
]
ProjectDirectorySortKey = Literal[
    "default",
    "name",
    "work_package_count",
    "open_work_package_count",
    "overdue_count",
    "member_count",
    "health",
]
ProjectDirectorySortDirection = Literal["asc", "desc"]
ProjectDirectoryLayout = Literal["grid", "list"]


class ProjectDirectoryPreferencesPut(BaseModel):
    columns: list[ProjectDirectoryColumn]
    sort_key: ProjectDirectorySortKey
    sort_direction: ProjectDirectorySortDirection
    layout: ProjectDirectoryLayout


class ProjectDirectoryPreferencesRead(ProjectDirectoryPreferencesPut):
    updated_at: datetime | None
    is_default: bool
