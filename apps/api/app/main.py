"""OneFlow API application factory."""

import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    access_tokens,
    ai,
    attachments,
    auth,
    automation_rules,
    comments,
    cost_entries,
    csv_io,
    custom_fields,
    cycles,
    dashboard,
    documents,
    health,
    initiatives,
    intake,
    me,
    meetings,
    members,
    milestones,
    modules,
    ops,
    permissions,
    personal_notes,
    project_statuses,
    project_types,
    projects,
    reports,
    saved_filters,
    search,
    time_entries,
    users,
    watchers,
    webhooks,
    work_packages,
)
from app.core.config import Settings, get_settings
from app.core.logging import setup_logging
from app.core.middleware import (
    DevLoopbackGuardMiddleware,
    ExceptionGuardMiddleware,
    RequestIdMiddleware,
    RequestLogMiddleware,
)
from app.db.session import build_engine, build_sessionmaker, get_session
from app.services.webhooks import webhook_worker_loop


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level)

    engine = build_engine(settings)
    sessionmaker = build_sessionmaker(engine)

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        stop = asyncio.Event()
        worker = None
        if settings.webhooks_enabled:
            worker = asyncio.create_task(
                webhook_worker_loop(
                    sessionmaker,
                    settings,
                    stop,
                    getattr(application.state, "webhook_sender", None),
                ),
                name="oneflow-webhook-worker",
            )
        try:
            yield
        finally:
            stop.set()
            if worker is not None:
                worker.cancel()
                with suppress(asyncio.CancelledError):
                    await worker
            await engine.dispose()

    is_production = settings.env == "production"
    app = FastAPI(
        title="OneFlow API",
        version="0.1.0",
        lifespan=lifespan,
        # Production exposure reduction (§5): no interactive docs surface.
        docs_url=None if is_production else "/docs",
        redoc_url=None if is_production else "/redoc",
        openapi_url=None if is_production else "/openapi.json",
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = sessionmaker

    async def _get_session():
        # Fresh AsyncSession per request — never shared across requests (§5).
        async with sessionmaker() as session:
            yield session

    app.dependency_overrides[get_session] = _get_session
    # The explicit Settings must win everywhere: without this override,
    # Depends(get_settings) would resolve the lru-cached process-env Settings
    # and could split-brain against the middleware/engine (review finding #5).
    app.dependency_overrides[get_settings] = lambda: settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # add_middleware: last added = outermost. Order (outer→inner):
    # RequestId → ExceptionGuard → RequestLog → DevLoopbackGuard → CORS → app
    app.add_middleware(DevLoopbackGuardMiddleware, settings=settings)
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(ExceptionGuardMiddleware)
    app.add_middleware(RequestIdMiddleware)

    app.include_router(health.router, prefix="/api/v1", tags=["health"])
    app.include_router(ops.router, prefix="/api/v1", tags=["ops"])
    app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
    app.include_router(access_tokens.router, prefix="/api/v1", tags=["access-tokens"])
    app.include_router(webhooks.router, prefix="/api/v1", tags=["webhooks"])
    app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
    app.include_router(work_packages.router, prefix="/api/v1", tags=["work-packages"])
    app.include_router(csv_io.router, prefix="/api/v1", tags=["csv"])
    app.include_router(comments.router, prefix="/api/v1", tags=["comments"])
    app.include_router(members.router, prefix="/api/v1", tags=["members"])
    app.include_router(permissions.router, prefix="/api/v1", tags=["permissions"])
    app.include_router(reports.router, prefix="/api/v1", tags=["reports"])
    app.include_router(me.router, prefix="/api/v1", tags=["me"])
    app.include_router(personal_notes.router, prefix="/api/v1", tags=["personal-notes"])
    app.include_router(time_entries.router, prefix="/api/v1", tags=["time-entries"])
    app.include_router(dashboard.router, prefix="/api/v1", tags=["dashboard"])
    app.include_router(cost_entries.router, prefix="/api/v1", tags=["cost-entries"])
    app.include_router(milestones.router, prefix="/api/v1", tags=["milestones"])
    app.include_router(cycles.router, prefix="/api/v1", tags=["cycles"])
    app.include_router(modules.router, prefix="/api/v1", tags=["modules"])
    app.include_router(search.router, prefix="/api/v1", tags=["search"])
    app.include_router(saved_filters.router, prefix="/api/v1", tags=["saved-filters"])
    app.include_router(project_statuses.router, prefix="/api/v1", tags=["project-statuses"])
    app.include_router(project_types.router, prefix="/api/v1", tags=["project-types"])
    app.include_router(automation_rules.router, prefix="/api/v1", tags=["automation-rules"])
    app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
    app.include_router(documents.router, prefix="/api/v1", tags=["documents"])
    app.include_router(meetings.router, prefix="/api/v1", tags=["meetings"])
    app.include_router(attachments.router, prefix="/api/v1", tags=["attachments"])
    app.include_router(watchers.router, prefix="/api/v1", tags=["watchers"])
    app.include_router(intake.router, prefix="/api/v1", tags=["intake"])
    app.include_router(custom_fields.router, prefix="/api/v1", tags=["custom-fields"])
    app.include_router(initiatives.router, prefix="/api/v1", tags=["initiatives"])
    app.include_router(users.router, prefix="/api/v1", tags=["users"])
    return app


app = create_app()
