import base64
import hashlib
import hmac
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, token_hash
from app.core.config import Settings, get_settings
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


def derive_raw_token(settings: Settings, user_id: uuid.UUID, nonce: str) -> str:
    digest = hmac.new(
        settings.access_token_derivation_key.get_secret_value().encode(),
        b"oneflow-personal-access-token-v1\0" + user_id.bytes + nonce.encode(),
        hashlib.sha256,
    ).digest()
    encoded = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return f"{TOKEN_PREFIX}{encoded}"


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
    settings: Settings = Depends(get_settings),
) -> PersonalAccessTokenCreated:
    user_id = user.id
    raw = derive_raw_token(settings, user_id, body.token_nonce)
    hashed = token_hash(raw)
    existing = (
        await session.execute(
            select(PersonalAccessToken).where(
                PersonalAccessToken.user_id == user_id,
                PersonalAccessToken.token_hash == hashed,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        duration = existing.expires_at - existing.created_at
        if existing.name != body.name or duration != timedelta(days=body.expires_in_days):
            raise HTTPException(status_code=409, detail="token nonce already used")
        return PersonalAccessTokenCreated(
            item=PersonalAccessTokenRead.model_validate(existing),
            token=raw,
        )

    now = datetime.now(UTC)
    row = PersonalAccessToken(
        user_id=user_id,
        name=body.name,
        token_hash=hashed,
        token_prefix=raw[:12],
        created_at=now,
        expires_at=now + timedelta(days=body.expires_in_days),
    )
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = (
            await session.execute(
                select(PersonalAccessToken).where(
                    PersonalAccessToken.user_id == user_id,
                    PersonalAccessToken.token_hash == hashed,
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            raise HTTPException(status_code=409, detail="token nonce already used") from None
        duration = existing.expires_at - existing.created_at
        if existing.name != body.name or duration != timedelta(days=body.expires_in_days):
            raise HTTPException(status_code=409, detail="token nonce already used") from None
        return PersonalAccessTokenCreated(
            item=PersonalAccessTokenRead.model_validate(existing),
            token=raw,
        )
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
