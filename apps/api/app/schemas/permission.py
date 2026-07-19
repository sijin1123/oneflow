import uuid
from typing import Literal

from pydantic import BaseModel

Allow = Literal["always", "never", "conditional"]


class PermissionVerb(BaseModel):
    key: str
    label: str
    owner: Allow
    member: Allow
    viewer: Allow
    # Human condition for 'conditional' cells (v62.1 R1-① three-state model).
    condition: str | None
    note: str | None
    effective: Allow


class PermissionCustomRole(BaseModel):
    id: uuid.UUID
    name: str
    permissions: list[str]


class PermissionReportRead(BaseModel):
    my_role: str
    my_custom_role: PermissionCustomRole | None = None
    verbs: list[PermissionVerb]
