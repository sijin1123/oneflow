"""Durable data-transfer history and immutable export artifact contracts."""

import hashlib
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models.data_transfer_job import DataTransferJob
from app.models.work_package import WorkPackage
from app.services import data_transfers
from tests.conftest import create_project, create_wp


@pytest.fixture
async def project(client):
    return await create_project(client, key="XFR", name="Transfers")


async def _jobs(client, project_id=None):
    suffix = f"?project_id={project_id}" if project_id else ""
    response = await client.get(f"/api/v1/data-transfer-jobs{suffix}")
    assert response.status_code == 200, response.text
    return response.json()


async def test_export_job_preserves_exact_artifact_and_legacy_get_is_pure(client, project):
    project_id = project["id"]
    await create_wp(client, project_id, subject="첫 작업", priority="high")

    legacy = await client.get(f"/api/v1/projects/{project_id}/work-packages/export.csv")
    assert legacy.status_code == 200
    assert (await _jobs(client, project_id))["total"] == 0

    created = await client.post(f"/api/v1/projects/{project_id}/data-transfer-jobs/export")
    assert created.status_code == 201, created.text
    body = created.json()
    artifact_url = f"/api/v1/data-transfer-jobs/{body['job_id']}/artifact"
    first = await client.get(artifact_url)
    assert first.status_code == 200
    assert first.content == legacy.content
    assert hashlib.sha256(first.content).hexdigest() == body["artifact_sha256"]
    assert first.headers["x-oneflow-checksum"] == body["checksum"]

    await create_wp(client, project_id, subject="나중 작업")
    second = await client.get(artifact_url)
    assert second.content == first.content

    jobs = await _jobs(client, project_id)
    assert jobs["total"] == 1
    item = jobs["items"][0]
    assert item["direction"] == "export"
    assert item["source"] == "oneflow"
    assert item["status"] == "completed"
    assert item["total_rows"] == 1
    assert item["artifact_available"] is True


async def test_import_preview_and_apply_are_recorded(client, project):
    project_id = project["id"]
    content = "subject,status\n정상,todo\n오류,unknown\n"
    for dry_run in (True, False):
        response = await client.post(
            f"/api/v1/projects/{project_id}/work-packages/import",
            json={"content": content, "dry_run": dry_run},
        )
        assert response.status_code == 200, response.text

    jobs = await _jobs(client, project_id)
    assert jobs["total"] == 2
    assert {item["dry_run"] for item in jobs["items"]} == {True, False}
    assert all(item["status"] == "completed_with_errors" for item in jobs["items"])
    assert all(item["total_rows"] == 2 and item["invalid_rows"] == 1 for item in jobs["items"])
    assert next(item for item in jobs["items"] if not item["dry_run"])["inserted_rows"] == 1


@pytest.mark.parametrize(
    ("source", "content"),
    [
        ("jira", "Summary,Status\nJira 작업,To Do\n"),
        ("linear", "Title,Status\nLinear 작업,Todo\n"),
    ],
)
async def test_adapter_source_is_recorded(client, project, source, content):
    response = await client.post(
        f"/api/v1/projects/{project['id']}/work-packages/import/{source}",
        json={"content": content, "dry_run": True},
    )
    assert response.status_code == 200, response.text
    jobs = await _jobs(client, project["id"])
    assert jobs["items"][0]["source"] == source
    assert jobs["items"][0]["dry_run"] is True


async def test_error_history_is_bounded_and_reports_truncation(client, project):
    rows = "\n".join(f"오류 {index},unknown" for index in range(101))
    response = await client.post(
        f"/api/v1/projects/{project['id']}/work-packages/import",
        json={"content": f"subject,status\n{rows}\n", "dry_run": True},
    )
    assert response.status_code == 200, response.text
    job = (await _jobs(client, project["id"]))["items"][0]
    assert job["invalid_rows"] == 101
    assert job["errors_truncated"] is True


async def test_archived_project_can_export_but_cannot_import(client, project):
    project_id = project["id"]
    assert (await client.post(f"/api/v1/projects/{project_id}/archive")).status_code == 200
    exported = await client.post(f"/api/v1/projects/{project_id}/data-transfer-jobs/export")
    assert exported.status_code == 201, exported.text
    imported = await client.post(
        f"/api/v1/projects/{project_id}/work-packages/import",
        json={"content": "subject\n작업\n", "dry_run": True},
    )
    assert imported.status_code == 409


async def test_history_and_artifact_hide_foreign_projects(client, project, foreign_project):
    created = await client.post(f"/api/v1/projects/{project['id']}/data-transfer-jobs/export")
    job_id = created.json()["job_id"]

    filtered = await client.get(
        f"/api/v1/data-transfer-jobs?project_id={foreign_project['project_id']}"
    )
    assert filtered.status_code == 404
    assert (await _jobs(client))["total"] == 1

    foreign_export = await client.post(
        f"/api/v1/projects/{foreign_project['project_id']}/data-transfer-jobs/export"
    )
    assert foreign_export.status_code == 404
    assert (await client.get(f"/api/v1/data-transfer-jobs/{job_id}/artifact")).status_code == 200


async def test_corrupted_artifact_is_rejected(client, app, project):
    created = await client.post(f"/api/v1/projects/{project['id']}/data-transfer-jobs/export")
    job_id = created.json()["job_id"]
    async with app.state.sessionmaker() as session:
        job = await session.get(DataTransferJob, job_id)
        assert job is not None and job.artifact_storage_key is not None
        path = Path(app.state.settings.storage_dir) / job.artifact_storage_key
    path.write_bytes(b"tampered")

    response = await client.get(f"/api/v1/data-transfer-jobs/{job_id}/artifact")
    assert response.status_code == 409


async def test_download_uses_validated_bytes_if_file_disappears(client, app, project, monkeypatch):
    created = await client.post(f"/api/v1/projects/{project['id']}/data-transfer-jobs/export")
    job_id = created.json()["job_id"]
    async with app.state.sessionmaker() as session:
        job = await session.get(DataTransferJob, job_id)
        assert job is not None and job.artifact_storage_key is not None
        artifact_path = Path(app.state.settings.storage_dir) / job.artifact_storage_key
    expected = artifact_path.read_bytes()
    original_read_bytes = Path.read_bytes

    def read_then_remove(path):
        content = original_read_bytes(path)
        path.unlink()
        return content

    monkeypatch.setattr(Path, "read_bytes", read_then_remove)
    response = await client.get(f"/api/v1/data-transfer-jobs/{job_id}/artifact")
    assert response.status_code == 200
    assert response.content == expected


async def test_export_size_limit_leaves_no_job_or_artifact(client, app, project):
    await create_wp(client, project["id"], subject="larger-than-one-byte")
    app.state.settings.upload_max_bytes = 1
    response = await client.post(f"/api/v1/projects/{project['id']}/data-transfer-jobs/export")
    assert response.status_code == 413
    assert (await _jobs(client, project["id"]))["total"] == 0
    assert not list(Path(app.state.settings.storage_dir).rglob("*"))


async def test_retention_removes_old_row_and_artifact(client, app, project, monkeypatch):
    monkeypatch.setattr(data_transfers, "MAX_TRANSFER_JOBS_PER_PROJECT", 2)
    ids = []
    for index in range(3):
        await create_wp(client, project["id"], subject=f"작업 {index}")
        response = await client.post(f"/api/v1/projects/{project['id']}/data-transfer-jobs/export")
        ids.append(response.json()["job_id"])

    jobs = await _jobs(client, project["id"])
    assert jobs["total"] == 2
    assert ids[0] not in {item["id"] for item in jobs["items"]}
    assert (await client.get(f"/api/v1/data-transfer-jobs/{ids[0]}/artifact")).status_code == 404
    files = [path for path in Path(app.state.settings.storage_dir).rglob("*") if path.is_file()]
    assert len(files) == 2


async def test_import_job_failure_rolls_back_work_items(client, app, project, monkeypatch):
    async def fail_history(*args, **kwargs):
        raise RuntimeError("history failed")

    monkeypatch.setattr("app.api.v1.csv_io.persist_import_job", fail_history)
    response = await client.post(
        f"/api/v1/projects/{project['id']}/work-packages/import",
        json={"content": "subject\n원자적 작업\n", "dry_run": False},
    )
    assert response.status_code == 500
    async with app.state.sessionmaker() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(WorkPackage)
            .where(WorkPackage.project_id == project["id"])
        )
    assert count == 0
