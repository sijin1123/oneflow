from typing import Literal

from pydantic import BaseModel

OverdueReminderDays = Literal[0, 3, 7, 14]


class NotificationSettingsRead(BaseModel):
    assigned: bool
    watched: bool
    commented: bool
    mention: bool
    due_alerts: bool
    overdue_reminder_days: OverdueReminderDays
    intake: bool
    initiatives: bool


class NotificationSettingsUpdate(BaseModel):
    """Partial update — omitted fields keep their current (or default) value."""

    assigned: bool | None = None
    watched: bool | None = None
    commented: bool | None = None
    mention: bool | None = None
    due_alerts: bool | None = None
    overdue_reminder_days: OverdueReminderDays | None = None
    intake: bool | None = None
    initiatives: bool | None = None
