"""Idempotent demo seed with destructive-reset guards (PLAN §1.3 #6 / §9).

Usage:
    uv run python -m app.seed              # idempotent seed (skips if data exists)
    uv run python -m app.seed --reset --yes  # guarded truncate + reseed

Guards:
- Runs only when ONEFLOW_ENV ∈ {development, test}.
- --reset default allowance: DB name ending with `_test` AND loopback/compose host.
- Non-`_test` reset additionally requires host allowlist + exact token
  ONEFLOW_ALLOW_DESTRUCTIVE_RESET=local-dev-only + DB name == 'oneflow'
  + dry-run preview + --yes.
- Remote hosts / SSL DSNs are refused unconditionally, regardless of DB name.
- Shared/staging/production environments get no reset path at all.
"""

import argparse
import asyncio
import datetime as dt
import sys
import uuid
from collections.abc import Callable

from sqlalchemy import func, select, text
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import build_engine, build_sessionmaker
from app.models import (
    Activity,
    CostEntry,
    Milestone,
    Project,
    ProjectMember,
    ProjectStatus,
    TimeEntry,
    User,
    WorkPackage,
    WorkPackageComment,
    WorkPackageRelation,
)
from app.models.project_status import DEFAULT_STATUSES
from app.models.project_type import DEFAULT_TYPES, ProjectType
from app.services.activity import (
    ActorIdentitySnapshot,
    activity_actor_fields,
    comment_author_fields,
)

DEV_USER_EMAIL = "dev@oneflow.local"
ALLOWED_RESET_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres"}
TABLES_IN_TRUNCATE_ORDER = (
    "work_package_relations",
    "work_packages",
    "project_members",
    "projects",
    "users",
)

# Test hook: raised just before the final insert to verify single-transaction
# atomicity (PLAN §13 failure-injection case). Never set outside tests.
_fail_hook: Callable[[], None] | None = None


class SeedGuardError(RuntimeError):
    pass


def check_env_guard(settings: Settings) -> None:
    if settings.env not in {"development", "test"}:
        raise SeedGuardError(
            f"seed is only allowed when ONEFLOW_ENV is development/test (got {settings.env!r}). "
            "Staging/production initial data must use a separate fixture/migration procedure."
        )


def check_reset_guard(settings: Settings, database_url: str) -> None:
    """Multi-layer destructive-reset guard (PLAN §9). Raises SeedGuardError to refuse."""
    url = make_url(database_url)
    host = url.host or ""
    db_name = url.database or ""
    query_keys = {k.lower() for k in (url.query or {})}

    # Remote / SSL DSNs are refused regardless of DB name suffix.
    if host not in ALLOWED_RESET_HOSTS:
        raise SeedGuardError(
            f"--reset refused: host {host!r} is not in the local allowlist "
            f"{sorted(ALLOWED_RESET_HOSTS)}"
        )
    if any(k.startswith("ssl") for k in query_keys):
        raise SeedGuardError("--reset refused: SSL-parameterized DSN suggests a non-local database")

    if db_name.endswith("_test"):
        return  # default allowance: test databases (host allowlist already applied)

    # dev-DB reset: 4-factor verification.
    if not settings.destructive_reset_enabled:
        raise SeedGuardError(
            "--reset on a non-test DB requires ONEFLOW_ALLOW_DESTRUCTIVE_RESET=local-dev-only"
        )
    if db_name != "oneflow":
        raise SeedGuardError(
            f"--reset refused: non-test DB name must be local default 'oneflow', got {db_name!r}"
        )


def _masked(dsn: str) -> str:
    url = make_url(dsn)
    return str(url.set(password="***")) if url.password else dsn


async def _dry_run_preview(session: AsyncSession, dsn: str) -> None:
    print(f"[seed --reset] target DSN: {_masked(dsn)}")
    for table in TABLES_IN_TRUNCATE_ORDER:
        count = (await session.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one()
        print(f"[seed --reset]   would truncate {table}: {count} rows")


async def _truncate_all(session: AsyncSession) -> None:
    tables = ", ".join(TABLES_IN_TRUNCATE_ORDER)
    await session.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))


async def seed_data(session: AsyncSession) -> bool:
    """Insert demo data in ONE transaction. Returns False if skipped (idempotent)."""
    today = dt.date.today()

    async with session.begin():
        existing = (await session.execute(select(func.count()).select_from(Project))).scalar_one()
        if existing > 0:
            print("[seed] projects already exist — skipping (idempotent)")
            return False

        dev = (
            await session.execute(select(User).where(User.email == DEV_USER_EMAIL))
        ).scalar_one_or_none()
        if dev is None:
            dev = User(email=DEV_USER_EMAIL, display_name="Dev User", is_admin=True)
            session.add(dev)
        else:
            dev.is_admin = True  # keep re-seeded dev DBs administrable (v33.1 R1-(2))
        mate = User(email="alex@oneflow.local", display_name="Alex Kim")
        session.add(mate)
        observer = User(email="viewer@oneflow.local", display_name="Viewer Choi")
        session.add(observer)
        await session.flush()

        project = Project(
            key="ONE",
            name="OneFlow 도입",
            description="OneFlow 자체 도입 프로젝트 — 데모 데이터",
            budget=20_000_000,
        )
        session.add(project)
        await session.flush()
        session.add_all(
            [
                ProjectMember(project_id=project.id, user_id=dev.id, role="owner"),
                ProjectMember(project_id=project.id, user_id=mate.id, role="member"),
                ProjectMember(project_id=project.id, user_id=observer.id, role="viewer"),
            ]
        )
        # Seed the default workflow so the demo project has an editable status
        # config, matching the API create path (fable5 audit: seed skipped this).
        session.add_all(
            ProjectStatus(project_id=project.id, key=key, name=name, position=pos)
            for key, name, pos in DEFAULT_STATUSES
        )
        session.add_all(
            ProjectType(project_id=project.id, key=key, name=name, position=pos)
            for key, name, pos in DEFAULT_TYPES
        )
        milestone = Milestone(
            project_id=project.id,
            name="v1.0 사내 릴리스",
            due_date=today + dt.timedelta(days=30),
        )
        session.add(milestone)
        await session.flush()

        def wp(
            subject,
            *,
            type="task",
            status="backlog",
            priority="none",
            assignee=None,
            start=None,
            due=None,
            parent=None,
            description=None,
            est=None,
        ) -> WorkPackage:
            item = WorkPackage(
                id=uuid.uuid4(),
                project_id=project.id,
                subject=subject,
                description=description,
                type=type,
                status=status,
                priority=priority,
                assignee_id=assignee,
                start_date=start,
                due_date=due,
                parent_id=parent,
                estimated_hours=est,
            )
            session.add(item)
            return item

        epic = wp(
            "프로젝트 기반 구축",
            type="feature",
            status="in_progress",
            priority="high",
            assignee=dev.id,
            start=today - dt.timedelta(days=7),
            due=today + dt.timedelta(days=21),
            description="백엔드/프론트 기반 구조를 세우는 상위 작업",
        )
        await session.flush()
        wp(
            "FastAPI 스캐폴드",
            status="done",
            priority="high",
            assignee=dev.id,
            start=today - dt.timedelta(days=7),
            due=today - dt.timedelta(days=3),
            parent=epic.id,
        )
        api_wp = wp(
            "워크패키지 API",
            status="in_review",
            priority="high",
            assignee=dev.id,
            start=today - dt.timedelta(days=4),
            due=today + dt.timedelta(days=2),
            parent=epic.id,
            est=16,
        )
        ui_wp = wp(
            "Plane-like UI 셸",
            type="feature",
            status="in_progress",
            priority="medium",
            assignee=mate.id,
            start=today - dt.timedelta(days=2),
            due=today + dt.timedelta(days=7),
            parent=epic.id,
        )
        wp(
            "보드 뷰",
            status="todo",
            priority="medium",
            assignee=mate.id,
            due=today + dt.timedelta(days=10),
            parent=epic.id,
        )
        wp(
            "상세 드로어",
            status="todo",
            priority="medium",
            due=today + dt.timedelta(days=12),
            parent=epic.id,
        )
        wp("로그인 화면 문구 오타", type="bug", status="todo", priority="low")
        wp(
            "알림 설정이 저장되지 않음",
            type="bug",
            status="in_progress",
            priority="urgent",
            assignee=dev.id,
            due=today + dt.timedelta(days=1),
        )
        wp(
            "첫 사내 배포",
            type="milestone",
            status="backlog",
            priority="high",
            due=today + dt.timedelta(days=30),
        )
        wp("문서 모듈 조사", status="backlog", priority="low")
        wp("회의 모듈 조사", status="backlog", priority="none")
        wp(
            "성능 기준선 측정",
            status="backlog",
            priority="medium",
            due=today + dt.timedelta(days=25),
        )
        await session.flush()

        if _fail_hook is not None:
            _fail_hook()

        session.add_all(
            [
                WorkPackageRelation(
                    project_id=project.id,
                    source_id=api_wp.id,
                    target_id=ui_wp.id,
                    relation_type="blocks",
                ),
                WorkPackageRelation(
                    project_id=project.id,
                    source_id=epic.id,
                    target_id=api_wp.id,
                    relation_type="relates",
                ),
            ]
        )

        # A little history so the drawer's activity/comment section isn't empty.
        dev_snapshot = ActorIdentitySnapshot(
            name=dev.display_name,
            profile_image_storage_key=dev.profile_image_storage_key,
            profile_image_content_type=dev.profile_image_content_type,
        )
        mate_snapshot = ActorIdentitySnapshot(
            name=mate.display_name,
            profile_image_storage_key=mate.profile_image_storage_key,
            profile_image_content_type=mate.profile_image_content_type,
        )
        session.add_all(
            [
                Activity(
                    work_package_id=api_wp.id,
                    actor_id=dev.id,
                    action="created",
                    **activity_actor_fields(dev_snapshot),
                ),
                Activity(
                    work_package_id=api_wp.id,
                    actor_id=dev.id,
                    action="field_changed",
                    field="status",
                    old_value="todo",
                    new_value="in_review",
                    **activity_actor_fields(dev_snapshot),
                ),
                WorkPackageComment(
                    work_package_id=api_wp.id,
                    author_id=mate.id,
                    body="계약 테스트까지 통과 확인했습니다. 리뷰 부탁드려요.",
                    **comment_author_fields(mate_snapshot),
                ),
                Activity(
                    work_package_id=api_wp.id,
                    actor_id=mate.id,
                    action="commented",
                    **activity_actor_fields(mate_snapshot),
                ),
                TimeEntry(
                    work_package_id=api_wp.id,
                    user_id=dev.id,
                    hours=6,
                    spent_on=today - dt.timedelta(days=3),
                    comment="설계 및 모델링",
                ),
                TimeEntry(
                    work_package_id=api_wp.id,
                    user_id=dev.id,
                    hours=4.5,
                    spent_on=today - dt.timedelta(days=1),
                    comment="엔드포인트 구현",
                ),
                CostEntry(
                    work_package_id=api_wp.id,
                    user_id=dev.id,
                    amount=1_260_000,
                    kind="labor",
                    spent_on=today - dt.timedelta(days=2),
                    comment="개발 인건비",
                ),
            ]
        )

    print("[seed] demo data inserted (1 project, 3 users, 12 work packages, 2 relations, history)")
    return True


async def run(reset: bool, yes: bool) -> int:
    settings = get_settings()
    check_env_guard(settings)

    engine = build_engine(settings)
    sessionmaker = build_sessionmaker(engine)
    try:
        async with sessionmaker() as session:
            if reset:
                check_reset_guard(settings, settings.database_url)
                await _dry_run_preview(session, settings.database_url)
                if not yes:
                    print("[seed --reset] dry-run only. Re-run with --yes to execute.")
                    return 0
                # The preview SELECTs autobegan a transaction on this session;
                # close it or session.begin() below raises InvalidRequestError
                # (review finding #4).
                await session.rollback()
                async with session.begin():
                    await _truncate_all(session)
                print("[seed --reset] truncated all tables")
            await seed_data(session)
        return 0
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="OneFlow demo seed")
    parser.add_argument("--reset", action="store_true", help="truncate all tables before seeding")
    parser.add_argument("--yes", action="store_true", help="confirm destructive reset")
    args = parser.parse_args()
    try:
        raise SystemExit(asyncio.run(run(reset=args.reset, yes=args.yes)))
    except SeedGuardError as exc:
        print(f"[seed] REFUSED: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()
