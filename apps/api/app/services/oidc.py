"""Bounded OIDC provider I/O and ID-token verification."""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx
import jwt

from app.core.config import OidcProviderConfig

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
    binding_email: str | None


def validate_provider_endpoint(url: str, provider: OidcProviderConfig) -> str:
    try:
        parts = urlsplit(url)
        endpoint_host = parts.hostname.lower() if parts.hostname else ""
        endpoint_port = parts.port
    except ValueError as exc:
        raise OidcProviderError("provider endpoint is not allowed") from exc
    try:
        is_ipv6 = ipaddress.ip_address(endpoint_host).version == 6
    except ValueError:
        is_ipv6 = False
    rendered_host = f"[{endpoint_host}]" if is_ipv6 else endpoint_host
    endpoint_host = (
        f"{rendered_host}:{endpoint_port}" if endpoint_port not in {None, 443} else rendered_host
    )
    if (
        parts.scheme != "https"
        or not parts.netloc
        or parts.username
        or parts.password
        or parts.fragment
        or endpoint_host not in provider.allowed_hosts
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
    provider: OidcProviderConfig,
) -> OidcMetadata:
    discovery_url = validate_provider_endpoint(
        provider.issuer.rstrip("/") + "/.well-known/openid-configuration",
        provider,
    )
    payload = await _request_json(
        client,
        "GET",
        discovery_url,
        headers={"Accept": "application/json"},
    )
    if payload.get("issuer") != provider.issuer:
        raise OidcProviderError("provider issuer does not match configuration")
    try:
        authorization_endpoint = validate_provider_endpoint(
            str(payload["authorization_endpoint"]), provider
        )
        token_endpoint = validate_provider_endpoint(str(payload["token_endpoint"]), provider)
        jwks_uri = validate_provider_endpoint(str(payload["jwks_uri"]), provider)
    except (KeyError, TypeError) as exc:
        raise OidcProviderError("provider metadata is incomplete") from exc
    return OidcMetadata(
        authorization_endpoint=authorization_endpoint,
        token_endpoint=token_endpoint,
        jwks_uri=jwks_uri,
    )


async def exchange_code(
    client: httpx.AsyncClient,
    provider: OidcProviderConfig,
    metadata: OidcMetadata,
    *,
    code: str,
    code_verifier: str,
) -> str:
    payload = await _request_json(
        client,
        "POST",
        metadata.token_endpoint,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": provider.redirect_uri,
            "client_id": provider.client_id,
            "client_secret": provider.client_secret.get_secret_value(),
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
    provider: OidcProviderConfig,
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
    if (
        algorithm not in OIDC_SIGNING_ALGORITHMS
        or not isinstance(key_id, str)
        or not key_id
        or "jku" in header
        or "x5u" in header
    ):
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
            audience=provider.client_id,
            issuer=provider.issuer,
            leeway=60,
            options={"require": ["iss", "sub", "aud", "exp", "iat", "nonce"]},
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
    if authorized_party is not None and authorized_party != provider.client_id:
        raise OidcProviderError("ID token authorized party does not match")
    if isinstance(audience, list) and len(audience) > 1 and authorized_party != provider.client_id:
        raise OidcProviderError("ID token authorized party is required")
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject or len(subject) > 255:
        raise OidcProviderError("ID token subject is invalid")
    binding_email: str | None = None
    email = claims.get("email")
    if (
        provider.alias != "microsoft"
        and claims.get("email_verified") is True
        and isinstance(email, str)
    ):
        normalized_email = email.strip().lower()
        local, separator, domain = normalized_email.rpartition("@")
        if (
            separator
            and local
            and len(normalized_email) <= 320
            and domain in provider.allowed_email_domains
            and (provider.alias != "google" or domain == "gmail.com" or claims.get("hd") == domain)
        ):
            binding_email = normalized_email
    return OidcClaims(
        issuer=provider.issuer,
        subject=subject,
        binding_email=binding_email,
    )
