import re
import uuid

from pydantic import BaseModel, field_validator

ROLES = ("owner", "member")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class MemberRead(BaseModel):
    user_id: uuid.UUID
    email: str
    display_name: str
    role: str


class MemberList(BaseModel):
    items: list[MemberRead]
    total: int


class MemberCreate(BaseModel):
    email: str
    role: str = "member"

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("invalid email")
        return v

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        return v


class MemberRoleUpdate(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        return v
