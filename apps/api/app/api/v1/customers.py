import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.dates import utc_today
from app.db.session import get_session
from app.models.customer import Customer
from app.models.member import ProjectMember
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WorkPackage
from app.schemas.customer import (
    CustomerCreate,
    CustomerList,
    CustomerProgress,
    CustomerRead,
    CustomerUpdate,
    normalize_customer_tags,
)
from app.services.workspace_features import CUSTOMERS_FEATURE, feature_enabled, feature_policy


async def _require_customers_enabled(session: AsyncSession = Depends(get_session)) -> None:
    if not await feature_enabled(session, CUSTOMERS_FEATURE):
        raise HTTPException(status_code=404, detail="not found")


async def _lock_customers_enabled(session: AsyncSession) -> None:
    if not (await feature_policy(session, CUSTOMERS_FEATURE, for_update=True)).enabled:
        raise HTTPException(status_code=404, detail="not found")


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="workspace admin required")


async def _get(session: AsyncSession, customer_id: uuid.UUID) -> Customer:
    customer = (
        await session.execute(select(Customer).where(Customer.id == customer_id))
    ).scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=404, detail="not found")
    return customer


async def _progress(
    session: AsyncSession, customer_ids: list[uuid.UUID], user: User
) -> dict[uuid.UUID, CustomerProgress]:
    if not customer_ids:
        return {}
    visible_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    closed = WorkPackage.status.in_(WP_CLOSED_STATUSES)
    overdue = WorkPackage.status.not_in(WP_CLOSED_STATUSES) & (WorkPackage.due_date < utc_today())
    rows = await session.execute(
        select(
            WorkPackage.customer_id.label("customer_id"),
            func.count().label("total"),
            func.count().filter(WorkPackage.status.not_in(WP_CLOSED_STATUSES)).label("open"),
            func.count().filter(closed).label("done"),
            func.count().filter(overdue).label("overdue"),
            func.count(func.distinct(WorkPackage.project_id)).label("project_count"),
        )
        .where(
            WorkPackage.customer_id.in_(customer_ids),
            WorkPackage.project_id.in_(visible_projects),
        )
        .group_by(WorkPackage.customer_id)
    )
    return {
        row.customer_id: CustomerProgress(
            total=row.total,
            open=row.open,
            done=row.done,
            overdue=row.overdue,
            project_count=row.project_count,
        )
        for row in rows
    }


async def _read(session: AsyncSession, customer: Customer, user: User) -> CustomerRead:
    progress = await _progress(session, [customer.id], user)
    return CustomerRead.model_validate(customer).model_copy(
        update={"progress": progress.get(customer.id, CustomerProgress())}
    )


router = APIRouter(dependencies=[Depends(_require_customers_enabled)])


@router.get("/customers", response_model=CustomerList)
async def list_customers(
    query: str | None = Query(default=None, max_length=160),
    tag: str | None = Query(default=None, max_length=32),
    include_archived: bool = False,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomerList:
    stmt = select(Customer)
    if not include_archived:
        stmt = stmt.where(Customer.archived_at.is_(None))
    if query and (needle := query.strip()):
        stmt = stmt.where(Customer.name.icontains(needle, autoescape=True))
    if tag is not None:
        try:
            normalized_tag = normalize_customer_tags([tag])[0]
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        stmt = stmt.where(Customer.tags.contains([normalized_tag]))
    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        (
            await session.execute(
                stmt.order_by(Customer.name.asc(), Customer.id.asc()).limit(limit).offset(offset)
            )
        )
        .scalars()
        .all()
    )
    progress = await _progress(session, [row.id for row in rows], user)
    items = [
        CustomerRead.model_validate(row).model_copy(
            update={"progress": progress.get(row.id, CustomerProgress())}
        )
        for row in rows
    ]
    return CustomerList(items=items, total=total)


@router.post("/customers", response_model=CustomerRead, status_code=201)
async def create_customer(
    body: CustomerCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomerRead:
    _require_admin(user)
    await _lock_customers_enabled(session)
    customer = Customer(**body.model_dump())
    session.add(customer)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="customer name already exists") from None
    return await _read(session, customer, user)


@router.get("/customers/{customer_id}", response_model=CustomerRead)
async def get_customer(
    customer_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomerRead:
    return await _read(session, await _get(session, customer_id), user)


@router.patch("/customers/{customer_id}", response_model=CustomerRead)
async def update_customer(
    customer_id: uuid.UUID,
    body: CustomerUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomerRead:
    _require_admin(user)
    await _lock_customers_enabled(session)
    customer = await _get(session, customer_id)
    fields = body.model_dump(exclude_unset=True)
    if fields.get("name") is None and "name" in fields:
        raise HTTPException(status_code=422, detail="name cannot be null")
    if fields.get("tags") is None and "tags" in fields:
        raise HTTPException(status_code=422, detail="tags cannot be null")
    for key, value in fields.items():
        setattr(customer, key, value)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="customer name already exists") from None
    await session.refresh(customer)
    return await _read(session, customer, user)


@router.post("/customers/{customer_id}/archive", response_model=CustomerRead)
async def archive_customer(
    customer_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomerRead:
    _require_admin(user)
    await _lock_customers_enabled(session)
    customer = await _get(session, customer_id)
    if customer.archived_at is None:
        customer.archived_at = func.now()
        await session.commit()
        await session.refresh(customer)
    return await _read(session, customer, user)


@router.post("/customers/{customer_id}/restore", response_model=CustomerRead)
async def restore_customer(
    customer_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CustomerRead:
    _require_admin(user)
    await _lock_customers_enabled(session)
    customer = await _get(session, customer_id)
    if customer.archived_at is not None:
        customer.archived_at = None
        await session.commit()
        await session.refresh(customer)
    return await _read(session, customer, user)
