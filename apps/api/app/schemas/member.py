import re
import uuid

from pydantic import BaseModel, field_validator, model_validator

ROLES = ("owner", "member", "viewer")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class MemberRead(BaseModel):
    user_id: uuid.UUID
    email: str
    display_name: str
    role: str
    custom_role_id: uuid.UUID | None = None
    custom_role_name: str | None = None


class MemberList(BaseModel):
    items: list[MemberRead]
    total: int


class MemberCreate(BaseModel):
    email: str
    role: str = "member"
    custom_role_id: uuid.UUID | None = None

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

    @model_validator(mode="after")
    def _custom_role_shape(self) -> "MemberCreate":
        if self.custom_role_id is not None and self.role != "member":
            raise ValueError("custom roles can only be assigned with the member role")
        return self


class MemberRoleUpdate(BaseModel):
    role: str
    custom_role_id: uuid.UUID | None = None

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        return v

    @model_validator(mode="after")
    def _custom_role_shape(self) -> "MemberRoleUpdate":
        if self.custom_role_id is not None and self.role != "member":
            raise ValueError("custom roles can only be assigned with the member role")
        return self
