import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, token_hash
from app.db.session import get_session
from app.models.access_token import PersonalAccessToken
from app.models.user import User
from app.schemas.access_token import (
    PersonalAccessTokenCreate,
    PersonalAccessTokenCreated,
    PersonalAccessTokenList,
    PersonalAccessTokenRead,
)

router = APIRouter()

TOKEN_PREFIX = "ofp_"
TOKEN_RANDOM_BYTES = 32


def new_raw_token() -> str:
    return f"{TOKEN_PREFIX}{secrets.token_urlsafe(TOKEN_RANDOM_BYTES)}"


@router.get("/me/access-tokens", response_model=PersonalAccessTokenList)
async def list_access_tokens(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PersonalAccessTokenList:
    rows = (
        (
            await session.execute(
                select(PersonalAccessToken)
                .where(PersonalAccessToken.user_id == user.id)
                .order_by(
                    PersonalAccessToken.revoked_at.is_not(None),
                    PersonalAccessToken.created_at.desc(),
                    PersonalAccessToken.id.desc(),
                )
            )
        )
        .scalars()
        .all()
    )
    return PersonalAccessTokenList(items=list(rows), total=len(rows))


@router.post("/me/access-tokens", response_model=PersonalAccessTokenCreated, status_code=201)
async def create_access_token(
    body: PersonalAccessTokenCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> PersonalAccessTokenCreated:
    raw = new_raw_token()
    row = PersonalAccessToken(
        user_id=user.id,
        name=body.name,
        token_hash=token_hash(raw),
        token_prefix=raw[:12],
        expires_at=datetime.now(UTC) + timedelta(days=body.expires_in_days),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return PersonalAccessTokenCreated(item=PersonalAccessTokenRead.model_validate(row), token=raw)


@router.delete("/me/access-tokens/{token_id}", status_code=204)
async def revoke_access_token(
    token_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    result = await session.execute(
        sa_update(PersonalAccessToken)
        .where(
            PersonalAccessToken.id == token_id,
            PersonalAccessToken.user_id == user.id,
            PersonalAccessToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
        .returning(PersonalAccessToken.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="not found")
    await session.commit()
    return Response(status_code=204)
