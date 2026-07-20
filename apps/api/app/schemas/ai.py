import uuid

from pydantic import BaseModel, Field, field_validator


class AiCapabilities(BaseModel):
    ai_summary_enabled: bool


class AiSummaryRequest(BaseModel):
    question: str | None = Field(default=None, max_length=500)

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized or None


class AiSummaryResponse(BaseModel):
    work_package_id: uuid.UUID
    summary: str
    provider: str
