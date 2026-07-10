"""Capture, version, and atomically materialize immutable project templates."""

import uuid
from collections.abc import Mapping

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation_rule import AutomationRule
from app.models.custom_field import CustomField
from app.models.project_status import ProjectStatus
from app.models.project_template import ProjectTemplate, ProjectTemplateRevision
from app.models.project_type import ProjectType
from app.schemas.project_template import ProjectTemplateSnapshot, TemplateApplied


async def capture_project_settings(
    session: AsyncSession, source_id: uuid.UUID
) -> dict[str, object]:
    """Capture only supported configuration, then reject any invalid source state."""
    statuses = (
        (
            await session.execute(
                select(ProjectStatus)
                .where(ProjectStatus.project_id == source_id)
                .order_by(ProjectStatus.position, ProjectStatus.id)
            )
        )
        .scalars()
        .all()
    )
    types = (
        (
            await session.execute(
                select(ProjectType)
                .where(ProjectType.project_id == source_id)
                .order_by(ProjectType.position, ProjectType.id)
            )
        )
        .scalars()
        .all()
    )
    fields = (
        (
            await session.execute(
                select(CustomField)
                .where(CustomField.project_id == source_id)
                .order_by(CustomField.position, CustomField.id)
            )
        )
        .scalars()
        .all()
    )
    rules = (
        (
            await session.execute(
                select(AutomationRule)
                .where(AutomationRule.project_id == source_id)
                .order_by(AutomationRule.position, AutomationRule.created_at, AutomationRule.id)
            )
        )
        .scalars()
        .all()
    )
    snapshot = ProjectTemplateSnapshot.model_validate(
        {
            "schema_version": 1,
            "statuses": [
                {"key": row.key, "name": row.name, "position": row.position} for row in statuses
            ],
            "types": [
                {
                    "key": row.key,
                    "name": row.name,
                    "position": row.position,
                    "is_active": row.is_active,
                }
                for row in types
            ],
            "custom_fields": [
                {
                    "name": row.name,
                    "field_type": row.field_type,
                    "options": row.options,
                    "position": row.position,
                    "is_active": row.is_active,
                    "applies_to": row.applies_to,
                }
                for row in fields
            ],
            "automation_rules": [
                {
                    "name": row.name,
                    "trigger_type": row.trigger_type,
                    "trigger_value": row.trigger_value,
                    "action_type": row.action_type,
                    "action_value": row.action_value,
                    "condition_field": row.condition_field,
                    "condition_value": row.condition_value,
                    "position": row.position,
                }
                for row in rules
            ],
        }
    )
    return snapshot.model_dump(mode="json")


async def materialize_project_settings(
    session: AsyncSession,
    target_id: uuid.UUID,
    snapshot: ProjectTemplateSnapshot | Mapping[str, object],
) -> TemplateApplied:
    """Validate before writing, then apply settings in one rollback-safe savepoint."""
    parsed = ProjectTemplateSnapshot.model_validate(snapshot)
    existing = await session.execute(
        select(
            select(ProjectStatus.id).where(ProjectStatus.project_id == target_id).exists(),
            select(ProjectType.id).where(ProjectType.project_id == target_id).exists(),
            select(CustomField.id).where(CustomField.project_id == target_id).exists(),
            select(AutomationRule.id).where(AutomationRule.project_id == target_id).exists(),
        )
    )
    if any(existing.one()):
        raise ValueError("target project settings must be empty")
    async with session.begin_nested():
        session.add_all(
            ProjectStatus(project_id=target_id, **item.model_dump()) for item in parsed.statuses
        )
        session.add_all(
            ProjectType(project_id=target_id, **item.model_dump()) for item in parsed.types
        )
        session.add_all(
            CustomField(project_id=target_id, **item.model_dump()) for item in parsed.custom_fields
        )
        session.add_all(
            AutomationRule(project_id=target_id, **item.model_dump(), is_active=False)
            for item in parsed.automation_rules
        )
        await session.flush()
    return TemplateApplied(
        statuses=len(parsed.statuses),
        types=len(parsed.types),
        custom_fields=len(parsed.custom_fields),
        automation_rules=len(parsed.automation_rules),
    )


async def create_template_revision(
    session: AsyncSession,
    template_id: uuid.UUID,
    snapshot: ProjectTemplateSnapshot | Mapping[str, object],
    *,
    created_by: uuid.UUID | None = None,
) -> ProjectTemplateRevision:
    """Serialize version assignment with a per-template row lock."""
    parsed = ProjectTemplateSnapshot.model_validate(snapshot)
    template = (
        await session.execute(
            select(ProjectTemplate).where(ProjectTemplate.id == template_id).with_for_update()
        )
    ).scalar_one_or_none()
    if template is None:
        raise LookupError("project template not found")
    if template.deleted_at is not None:
        raise ValueError("deleted project templates cannot receive revisions")
    version = (
        await session.execute(
            select(func.coalesce(func.max(ProjectTemplateRevision.version), 0) + 1).where(
                ProjectTemplateRevision.template_id == template_id
            )
        )
    ).scalar_one()
    revision = ProjectTemplateRevision(
        template_id=template_id,
        version=version,
        snapshot=parsed.model_dump(mode="json"),
        created_by=created_by,
    )
    session.add(revision)
    await session.flush()
    return revision
