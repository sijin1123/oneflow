"""Test harness (PLAN §5/§13).

- Real PostgreSQL: `oneflow_test` is auto-created if missing, migrated via Alembic.
- Safety: aborts unless the test DB name ends with `_test`.
- Isolation: per-test TRUNCATE + dev-user re-creation; sessions are per-request
  (the app wiring itself), never shared across requests.
"""

import asyncio
import os
import pathlib
import tempfile
import uuid

import asyncpg
import pytest
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.engine.url import make_url

from alembic import command
from app.core.auth import DEV_USER_EMAIL
from app.core.config import Settings
from app.main import create_app
from app.models import Project, ProjectMember, User, WorkPackage, WorkPackageRelation

API_DIR = pathlib.Path(__file__).resolve().parents[1]

TEST_URL = os.environ.get(
    "ONEFLOW_TEST_DATABASE_URL",
    "postgresql+asyncpg://oneflow:oneflow@localhost:5432/oneflow_test",
)

_parsed = make_url(TEST_URL)
if not (_parsed.database or "").endswith("_test"):
    pytest.exit(
        f"refusing to run: test database name must end with '_test', got {_parsed.database!r}",
        returncode=2,
    )


def make_test_settings(**overrides) -> Settings:
    base = dict(
        env="test",
        database_url=TEST_URL,
        test_database_url=TEST_URL,
        auth_mode="dev",
        cors_origins="http://localhost:5173",
        log_level="WARNING",
        # Isolated per-run blob root — uploads never land in the repo tree.
        storage_dir=tempfile.mkdtemp(prefix="oneflow-test-uploads-"),
    )
    base.update(overrides)
    return Settings(**base)


async def _ensure_database() -> None:
    admin = await asyncpg.connect(
        host=_parsed.host or "localhost",
        port=_parsed.port or 5432,
        user=_parsed.username,
        password=_parsed.password,
        database="postgres",
    )
    try:
        exists = await admin.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", _parsed.database
        )
        if not exists:
            await admin.execute(f'CREATE DATABASE "{_parsed.database}"')
    finally:
        await admin.close()


@pytest.fixture(scope="session", autouse=True)
def _prepare_database():
    asyncio.run(_ensure_database())
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", TEST_URL)
    command.upgrade(cfg, "head")


@pytest.fixture
async def app():
    application = create_app(make_test_settings())
    yield application
    await application.state.engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables(app):
    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            text(
                "TRUNCATE TABLE work_package_relations, work_packages, "
                "project_members, projects, users RESTART IDENTITY CASCADE"
            )
        )
        # Mirrors dev auto-provisioning: the fixed dev user is workspace admin.
        session.add(User(email=DEV_USER_EMAIL, display_name="Dev User", is_admin=True))


# NOTE: fixtures below take `_clean_tables` explicitly — pytest's autouse-first
# ordering proved unreliable for module-local fixtures chained through `client`,
# so the truncate-before-use ordering is made an explicit dependency.


@pytest.fixture
async def client(app, _clean_tables):
    transport = ASGITransport(app=app)  # default client is loopback 127.0.0.1
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def nonlocal_client(app, _clean_tables):
    transport = ASGITransport(app=app, client=("10.9.8.7", 40000))
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def dev_user(app, _clean_tables) -> User:
    async with app.state.sessionmaker() as session:
        return (
            await session.execute(select(User).where(User.email == DEV_USER_EMAIL))
        ).scalar_one()


@pytest.fixture
async def foreign_project(app, _clean_tables):
    """A project owned by someone else — the dev user is NOT a member."""
    async with app.state.sessionmaker() as session, session.begin():
        stranger = User(email="stranger@oneflow.local", display_name="Stranger")
        project = Project(key="ZZZ", name="남의 프로젝트")
        session.add_all([stranger, project])
        await session.flush()
        session.add(ProjectMember(project_id=project.id, user_id=stranger.id, role="owner"))
        wp = WorkPackage(project_id=project.id, subject="남의 작업")
        session.add(wp)
        await session.flush()
        return {"project_id": project.id, "wp_id": wp.id, "user_id": stranger.id}


@pytest.fixture
async def member_project(app, _clean_tables):
    """A project owned by someone else where the dev user is a plain MEMBER.

    For 403 (member-but-not-owner) and shared-project cross-user/foreign-resource
    checks — distinct from `foreign_project`, where the dev user is not a member."""
    async with app.state.sessionmaker() as session, session.begin():
        owner = User(email="owner@oneflow.local", display_name="Owner")
        project = Project(key="SHR", name="공유 프로젝트")
        session.add_all([owner, project])
        await session.flush()
        dev = (await session.execute(select(User).where(User.email == DEV_USER_EMAIL))).scalar_one()
        session.add_all(
            [
                ProjectMember(project_id=project.id, user_id=owner.id, role="owner"),
                ProjectMember(project_id=project.id, user_id=dev.id, role="member"),
            ]
        )
        return {"project_id": project.id, "owner_id": owner.id, "dev_id": dev.id}


async def create_project(client, key="ONE", name="테스트 프로젝트") -> dict:
    res = await client.post("/api/v1/projects", json={"key": key, "name": name})
    assert res.status_code == 201, res.text
    return res.json()


async def create_wp(client, project_id, subject="작업", **extra) -> dict:
    res = await client.post(
        f"/api/v1/projects/{project_id}/work-packages", json={"subject": subject, **extra}
    )
    assert res.status_code == 201, res.text
    return res.json()


__all__ = [
    "create_project",
    "create_wp",
    "make_test_settings",
    "TEST_URL",
    "WorkPackageRelation",
    "uuid",
]
