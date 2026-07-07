"""Auth configuration surface (expansion Pass 5 PR-N).

Deliberately UNAUTHENTICATED and independent of get_current_user: a login
screen must be able to discover the auth mode before any credential exists,
and in oidc mode every authenticated route returns 501 until the real flow
lands — this endpoint is the one that must keep answering.

Exposure policy: the issuer and client_id are public by OIDC design (they end
up in the browser anyway). The client secret is NEVER echoed — only its
presence as a boolean, so an operator can verify configuration without a
shell on the box.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import Settings, get_settings

router = APIRouter()


class AuthConfigRead(BaseModel):
    auth_mode: str
    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    has_client_secret: bool = False


@router.get("/auth/config", response_model=AuthConfigRead)
async def auth_config(settings: Settings = Depends(get_settings)) -> AuthConfigRead:
    if settings.auth_mode != "oidc":
        return AuthConfigRead(auth_mode=settings.auth_mode)
    return AuthConfigRead(
        auth_mode="oidc",
        oidc_issuer=settings.oidc_issuer,
        oidc_client_id=settings.oidc_client_id,
        has_client_secret=bool(settings.oidc_client_secret),
    )
