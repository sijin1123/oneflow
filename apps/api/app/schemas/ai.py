import uuid

from pydantic import BaseModel


class AiCapabilities(BaseModel):
    ai_summary_enabled: bool


class AiSummaryResponse(BaseModel):
    work_package_id: uuid.UUID
    summary: str
    provider: str
