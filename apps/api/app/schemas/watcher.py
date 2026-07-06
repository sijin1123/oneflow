import uuid

from pydantic import BaseModel


class WatcherRead(BaseModel):
    user_id: uuid.UUID
    display_name: str


class WatcherList(BaseModel):
    items: list[WatcherRead]
    total: int
    # Whether the CALLER watches this work package — drives the drawer toggle.
    me_watching: bool
