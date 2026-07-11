import uuid
from datetime import datetime

from pydantic import BaseModel


class WorkspaceFeatureCapability(BaseModel):
    enabled: bool
    revision: int


class AiWorkspaceFeatureCapability(WorkspaceFeatureCapability):
    deployment_enabled: bool
    effective_enabled: bool


class WorkspaceCapabilitiesRead(BaseModel):
    wiki: WorkspaceFeatureCapability
    ai: AiWorkspaceFeatureCapability
    initiatives: WorkspaceFeatureCapability


class WorkspaceFeaturePolicyRead(BaseModel):
    feature_key: str
    enabled: bool
    revision: int
    updated_by_user_id: uuid.UUID | None
    updated_by_name: str | None
    updated_at: datetime


class WorkspaceFeaturePolicyUpdate(BaseModel):
    enabled: bool


class AiWorkspaceFeaturePolicyRead(WorkspaceFeaturePolicyRead):
    deployment_enabled: bool
    effective_enabled: bool
