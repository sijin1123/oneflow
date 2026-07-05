"""Seed idempotency + single-transaction atomicity via failure injection (§13)."""

import pytest
from sqlalchemy import func, select

import app.seed as seed_module
from app.models import Project, ProjectMember, User, WorkPackage, WorkPackageRelation
from app.seed import seed_data

TABLES = (User, Project, ProjectMember, WorkPackage, WorkPackageRelation)


async def _counts(app) -> dict:
    async with app.state.sessionmaker() as session:
        out = {}
        for model in TABLES:
            out[model.__tablename__] = (
                await session.execute(select(func.count()).select_from(model))
            ).scalar_one()
        return out


async def test_seed_idempotent(app):
    async with app.state.sessionmaker() as session:
        assert await seed_data(session) is True
    first = await _counts(app)
    assert first["projects"] == 1 and first["work_packages"] == 12
    async with app.state.sessionmaker() as session:
        assert await seed_data(session) is False  # second run skips
    assert await _counts(app) == first


async def test_seed_creates_project_statuses(app):
    from app.models import ProjectStatus

    async with app.state.sessionmaker() as session:
        assert await seed_data(session) is True
        count = (
            await session.execute(select(func.count()).select_from(ProjectStatus))
        ).scalar_one()
    # the seeded project gets the full default workflow, like the API create path
    assert count == 6


async def test_seed_reset_end_to_end(app, _clean_tables, monkeypatch):
    # Full `python -m app.seed --reset --yes` flow via run() — regression for the
    # preview-autobegin vs session.begin() crash (review finding #4).
    from tests.conftest import make_test_settings

    monkeypatch.setattr(seed_module, "get_settings", lambda: make_test_settings())
    async with app.state.sessionmaker() as session:
        assert await seed_data(session) is True  # pre-existing data to truncate
    exit_code = await seed_module.run(reset=True, yes=True)
    assert exit_code == 0
    counts = await _counts(app)
    assert counts["projects"] == 1 and counts["work_packages"] == 12


async def test_seed_failure_injection_rolls_back_everything(app, monkeypatch):
    def boom():
        raise RuntimeError("injected failure before final insert")

    monkeypatch.setattr(seed_module, "_fail_hook", boom)
    async with app.state.sessionmaker() as session:
        with pytest.raises(RuntimeError):
            await seed_data(session)
    counts = await _counts(app)
    # Single transaction: no partial state may persist ("project without membership").
    assert counts["projects"] == 0
    assert counts["project_members"] == 0
    assert counts["work_packages"] == 0
    assert counts["work_package_relations"] == 0

    monkeypatch.setattr(seed_module, "_fail_hook", None)
    async with app.state.sessionmaker() as session:
        assert await seed_data(session) is True  # rerun completes normally
    assert (await _counts(app))["work_packages"] == 12
