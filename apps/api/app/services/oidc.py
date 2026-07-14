"""Bounded OIDC provider I/O and ID-token verification."""

from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx
import jwt

from app.core.config import Settings

OIDC_HTTP_TIMEOUT_SECONDS = 5.0
OIDC_MAX_RESPONSE_BYTES = 1_048_576
OIDC_SIGNING_ALGORITHMS = {"RS256", "ES256"}


class OidcProviderError(Exception):
    """A provider response failed OneFlow's trust or protocol contract."""


@dataclass(frozen=True)
class OidcMetadata:
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str


@dataclass(frozen=True)
class OidcClaims:
    issuer: str
    subject: str
    email: str


def configured_issuer(settings: Settings) -> str:
    return settings.oidc_issuer or ""


def validate_provider_endpoint(url: str, settings: Settings) -> str:
    parts = urlsplit(url)
    if (
        parts.scheme != "https"
        or not parts.netloc
        or parts.username
        or parts.password
        or parts.fragment
        or parts.netloc.lower() not in settings.oidc_allowed_host_list
    ):
        raise OidcProviderError("provider endpoint is not allowed")
    return url


@asynccontextmanager
async def provider_client(existing: httpx.AsyncClient | None) -> AsyncIterator[httpx.AsyncClient]:
    if existing is not None:
        yield existing
        return
    async with httpx.AsyncClient(
        timeout=OIDC_HTTP_TIMEOUT_SECONDS,
        follow_redirects=False,
    ) as client:
        yield client


async def _request_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    **kwargs: Any,
) -> dict[str, Any]:
    chunks: list[bytes] = []
    total = 0
    try:
        async with client.stream(method, url, **kwargs) as response:
            if response.status_code < 200 or response.status_code >= 300:
                raise OidcProviderError("provider request failed")
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > OIDC_MAX_RESPONSE_BYTES:
                    raise OidcProviderError("provider response is too large")
                chunks.append(chunk)
    except httpx.HTTPError as exc:
        raise OidcProviderError("provider request failed") from exc
    try:
        payload = json.loads(b"".join(chunks))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise OidcProviderError("provider returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise OidcProviderError("provider returned an invalid document")
    return payload


async def discover(
    client: httpx.AsyncClient,
    settings: Settings,
) -> OidcMetadata:
    discovery_url = validate_provider_endpoint(
        configured_issuer(settings).rstrip("/") + "/.well-known/openid-configuration",
        settings,
    )
    payload = await _request_json(
        client,
        "GET",
        discovery_url,
        headers={"Accept": "application/json"},
    )
    if payload.get("issuer") != configured_issuer(settings):
        raise OidcProviderError("provider issuer does not match configuration")
    try:
        authorization_endpoint = validate_provider_endpoint(
            str(payload["authorization_endpoint"]), settings
        )
        token_endpoint = validate_provider_endpoint(str(payload["token_endpoint"]), settings)
        jwks_uri = validate_provider_endpoint(str(payload["jwks_uri"]), settings)
    except (KeyError, TypeError) as exc:
        raise OidcProviderError("provider metadata is incomplete") from exc
    return OidcMetadata(
        authorization_endpoint=authorization_endpoint,
        token_endpoint=token_endpoint,
        jwks_uri=jwks_uri,
    )


async def exchange_code(
    client: httpx.AsyncClient,
    settings: Settings,
    metadata: OidcMetadata,
    *,
    code: str,
    code_verifier: str,
) -> str:
    secret = settings.oidc_client_secret
    payload = await _request_json(
        client,
        "POST",
        metadata.token_endpoint,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.oidc_redirect_uri or "",
            "client_id": settings.oidc_client_id or "",
            "client_secret": secret.get_secret_value() if secret else "",
            "code_verifier": code_verifier,
        },
        headers={"Accept": "application/json"},
    )
    id_token = payload.get("id_token")
    if not isinstance(id_token, str) or not id_token or len(id_token) > 32_768:
        raise OidcProviderError("provider did not return a usable ID token")
    return id_token


async def verify_id_token(
    client: httpx.AsyncClient,
    settings: Settings,
    metadata: OidcMetadata,
    *,
    id_token: str,
    nonce_hash: str,
) -> OidcClaims:
    try:
        header = jwt.get_unverified_header(id_token)
    except jwt.PyJWTError as exc:
        raise OidcProviderError("ID token header is invalid") from exc
    algorithm = header.get("alg")
    key_id = header.get("kid")
    if algorithm not in OIDC_SIGNING_ALGORITHMS or not isinstance(key_id, str) or not key_id:
        raise OidcProviderError("ID token uses an unsupported signing key")
    jwks = await _request_json(
        client,
        "GET",
        metadata.jwks_uri,
        headers={"Accept": "application/json"},
    )
    keys = jwks.get("keys")
    if not isinstance(keys, list):
        raise OidcProviderError("provider key set is invalid")
    candidates = [item for item in keys if isinstance(item, dict) and item.get("kid") == key_id]
    if len(candidates) != 1:
        raise OidcProviderError("ID token signing key was not found")
    if candidates[0].get("use") not in {None, "sig"} or candidates[0].get("alg") not in {
        None,
        algorithm,
    }:
        raise OidcProviderError("ID token signing key metadata is invalid")
    try:
        signing_key = jwt.PyJWK.from_dict(candidates[0], algorithm=algorithm).key
        claims = jwt.decode(
            id_token,
            signing_key,
            algorithms=[algorithm],
            audience=settings.oidc_client_id,
            issuer=configured_issuer(settings),
            leeway=60,
            options={"require": ["iss", "sub", "aud", "exp", "iat", "nonce", "email"]},
        )
    except (jwt.PyJWTError, ValueError) as exc:
        raise OidcProviderError("ID token validation failed") from exc
    token_nonce = claims.get("nonce")
    if not isinstance(token_nonce, str) or not hmac.compare_digest(
        hashlib.sha256(token_nonce.encode()).hexdigest(), nonce_hash
    ):
        raise OidcProviderError("ID token nonce does not match")
    audience = claims.get("aud")
    authorized_party = claims.get("azp")
    if authorized_party is not None and authorized_party != settings.oidc_client_id:
        raise OidcProviderError("ID token authorized party does not match")
    if (
        isinstance(audience, list)
        and len(audience) > 1
        and authorized_party != settings.oidc_client_id
    ):
        raise OidcProviderError("ID token authorized party is required")
    if claims.get("email_verified") is not True:
        raise OidcProviderError("provider email is not verified")
    subject = claims.get("sub")
    email = claims.get("email")
    if not isinstance(subject, str) or not subject or len(subject) > 255:
        raise OidcProviderError("ID token subject is invalid")
    if not isinstance(email, str):
        raise OidcProviderError("ID token email is invalid")
    normalized_email = email.strip().lower()
    if not normalized_email or len(normalized_email) > 320 or "@" not in normalized_email:
        raise OidcProviderError("ID token email is invalid")
    return OidcClaims(
        issuer=configured_issuer(settings),
        subject=subject,
        email=normalized_email,
    )
