"""OneFlow API application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    ai,
    attachments,
    automation_rules,
    comments,
    cost_entries,
    csv_io,
    dashboard,
    documents,
    health,
    me,
    meetings,
    members,
    milestones,
    project_statuses,
    projects,
    saved_filters,
    search,
    time_entries,
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


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level)

    engine = build_engine(settings)
    sessionmaker = build_sessionmaker(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
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
    app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
    app.include_router(work_packages.router, prefix="/api/v1", tags=["work-packages"])
    app.include_router(csv_io.router, prefix="/api/v1", tags=["csv"])
    app.include_router(comments.router, prefix="/api/v1", tags=["comments"])
    app.include_router(members.router, prefix="/api/v1", tags=["members"])
    app.include_router(me.router, prefix="/api/v1", tags=["me"])
    app.include_router(time_entries.router, prefix="/api/v1", tags=["time-entries"])
    app.include_router(dashboard.router, prefix="/api/v1", tags=["dashboard"])
    app.include_router(cost_entries.router, prefix="/api/v1", tags=["cost-entries"])
    app.include_router(milestones.router, prefix="/api/v1", tags=["milestones"])
    app.include_router(search.router, prefix="/api/v1", tags=["search"])
    app.include_router(saved_filters.router, prefix="/api/v1", tags=["saved-filters"])
    app.include_router(project_statuses.router, prefix="/api/v1", tags=["project-statuses"])
    app.include_router(automation_rules.router, prefix="/api/v1", tags=["automation-rules"])
    app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
    app.include_router(documents.router, prefix="/api/v1", tags=["documents"])
    app.include_router(meetings.router, prefix="/api/v1", tags=["meetings"])
    app.include_router(attachments.router, prefix="/api/v1", tags=["attachments"])
    return app


app = create_app()
