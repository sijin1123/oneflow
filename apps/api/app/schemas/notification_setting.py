from pydantic import BaseModel


class NotificationSettingsRead(BaseModel):
    assigned: bool
    watched: bool
    commented: bool
    mention: bool


class NotificationSettingsUpdate(BaseModel):
    """Partial update — omitted fields keep their current (or default) value."""

    assigned: bool | None = None
    watched: bool | None = None
    commented: bool | None = None
    mention: bool | None = None
