import base64
import hashlib
import json
import time
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient
from jwt.algorithms import RSAAlgorithm
from pydantic import SecretStr
from sqlalchemy import select, update

from app.main import create_app
from app.models.auth_session import AuthSession
from app.models.oidc import OidcIdentity, OidcLoginAttempt
from app.models.user import User
from tests.conftest import make_oidc_provider_test_settings, make_oidc_test_settings


class MockOidcProvider:
    def __init__(
        self,
        *,
        issuer: str = "https://idp.example.test",
        client_id: str = "oneflow-web",
    ) -> None:
        self.issuer = issuer
        self.client_id = client_id
        self.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.public_jwk = json.loads(RSAAlgorithm.to_jwk(self.private_key.public_key()))
        self.public_jwk.update({"kid": "oneflow-test-key", "alg": "RS256", "use": "sig"})
        self.nonce = ""
        self.subject = "employee-123"
        self.email = "employee@example.test"
        self.email_verified: bool | None = True
        self.claim_overrides: dict = {}
        self.header_overrides: dict = {}
        self.last_token_form: dict[str, list[str]] = {}
        self.metadata_overrides: dict = {}

    def id_token(self) -> str:
        now = int(time.time())
        claims = {
            "iss": self.issuer,
            "sub": self.subject,
            "aud": self.client_id,
            "iat": now,
            "exp": now + 300,
            "nonce": self.nonce,
            "email": self.email,
        }
        if self.email_verified is not None:
            claims["email_verified"] = self.email_verified
        claims.update(self.claim_overrides)
        return jwt.encode(
            claims,
            self.private_key,
            algorithm="RS256",
            headers={"kid": "oneflow-test-key", **self.header_overrides},
        )

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/.well-known/openid-configuration"):
            payload = {
                "issuer": self.issuer,
                "authorization_endpoint": f"{self.issuer.rstrip('/')}/authorize",
                "token_endpoint": f"{self.issuer.rstrip('/')}/token",
                "jwks_uri": f"{self.issuer.rstrip('/')}/jwks",
                **self.metadata_overrides,
            }
            return httpx.Response(200, json=payload)
        if request.url.path.endswith("/token"):
            self.last_token_form = parse_qs(request.content.decode())
            return httpx.Response(200, json={"id_token": self.id_token(), "access_token": "opaque"})
        if request.url.path.endswith("/jwks"):
            return httpx.Response(200, json={"keys": [self.public_jwk]})
        return httpx.Response(404)


@pytest.fixture
async def oidc_harness(_prepare_database, _clean_tables):
    settings = make_oidc_test_settings()
    app = create_app(settings)
    provider = MockOidcProvider()
    provider_http = AsyncClient(
        transport=httpx.MockTransport(provider),
        base_url="https://idp.example.test",
    )
    app.state.oidc_http_client = provider_http
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="https://api.oneflow.test",
        follow_redirects=False,
    ) as client:
        yield app, client, provider
    await provider_http.aclose()
    await app.state.engine.dispose()


async def provision(app, email: str = "employee@example.test", *, active: bool = True) -> User:
    async with app.state.sessionmaker() as session, session.begin():
        user = User(email=email, display_name="Employee", is_active=active)
        session.add(user)
        await session.flush()
        return user


async def start_login(
    client: AsyncClient,
    provider: MockOidcProvider,
    next_path: str = "/",
    *,
    provider_alias: str = "sso",
):
    response = await client.get(
        "/api/v1/auth/oidc/start",
        params={"next": next_path, "provider": provider_alias},
    )
    assert response.status_code == 302, response.text
    transaction_cookie = response.headers["set-cookie"]
    assert "oneflow_oidc_transaction=" in transaction_cookie
    assert "HttpOnly" in transaction_cookie
    assert "Secure" in transaction_cookie
    assert "SameSite=lax" in transaction_cookie
    assert "Path=/api/v1/auth/oidc/callback" in transaction_cookie
    location = response.headers["location"]
    query = parse_qs(urlsplit(location).query)
    provider.nonce = query["nonce"][0]
    return query, response


async def test_oidc_code_pkce_flow_binds_identity_and_issues_replay_safe_session(oidc_harness):
    app, client, provider = oidc_harness
    user = await provision(app)

    query, start = await start_login(client, provider, "/projects?view=board")
    assert urlsplit(start.headers["location"]).path == "/authorize"
    assert query["response_type"] == ["code"]
    assert query["scope"] == ["openid profile email"]
    assert query["code_challenge_method"] == ["S256"]
    state = query["state"][0]
    browser_token = client.cookies.get("oneflow_oidc_transaction")
    assert browser_token
    async with app.state.sessionmaker() as session:
        attempt = (await session.execute(select(OidcLoginAttempt))).scalar_one()
        assert attempt.browser_token_hash == hashlib.sha256(browser_token.encode()).hexdigest()
        assert browser_token not in {attempt.state_hash, attempt.browser_token_hash}
        assert attempt.provider == "sso"
        assert (
            attempt.config_fingerprint
            == app.state.settings.oidc_provider_config("sso").config_fingerprint
        )

    callback = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": state, "code": "authorization-code"},
    )
    assert callback.status_code == 303
    assert callback.headers["location"] == "https://oneflow.test/projects?view=board"
    assert "oneflow_session=" in callback.headers["set-cookie"]
    assert "HttpOnly" in callback.headers["set-cookie"]
    assert "Secure" in callback.headers["set-cookie"]
    assert provider.last_token_form["code"] == ["authorization-code"]
    verifier = provider.last_token_form["code_verifier"][0]
    expected_challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    assert query["code_challenge"] == [expected_challenge]

    me = await client.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["email"] == user.email
    async with app.state.sessionmaker() as session:
        identity = (await session.execute(select(OidcIdentity))).scalar_one()
        assert (identity.issuer, identity.subject, identity.user_id) == (
            "https://idp.example.test",
            "employee-123",
            user.id,
        )
        assert (await session.execute(select(AuthSession))).scalars().one()
        assert (await session.execute(select(OidcLoginAttempt))).scalar_one_or_none() is None

    replay = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": state, "code": "authorization-code"},
    )
    assert replay.status_code == 303
    assert replay.headers["location"].endswith("/login?auth_error=invalid_state")

    logout = await client.post("/api/v1/auth/logout", headers={"Origin": "https://oneflow.test"})
    assert logout.status_code == 204
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_oidc_logout_requires_trusted_browser_origin(oidc_harness):
    _app, client, _provider = oidc_harness
    missing = await client.post("/api/v1/auth/logout")
    assert missing.status_code == 403
    foreign = await client.post(
        "/api/v1/auth/logout", headers={"Origin": "https://attacker.example"}
    )
    assert foreign.status_code == 403


async def test_oidc_callback_is_bound_to_the_browser_that_started_login(oidc_harness):
    app, client, provider = oidc_harness
    await provision(app)
    query, _ = await start_login(client, provider)
    state = query["state"][0]

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="https://api.oneflow.test",
        follow_redirects=False,
    ) as another_browser:
        blocked = await another_browser.get(
            "/api/v1/auth/oidc/callback",
            params={"state": state, "code": "stolen-code"},
        )
    assert blocked.headers["location"].endswith("/login?auth_error=invalid_state")

    legitimate = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": state, "code": "legitimate-code"},
    )
    assert legitimate.status_code == 303
    assert legitimate.headers["location"] == "https://oneflow.test/"


async def test_oidc_accepts_multiple_audiences_only_with_matching_azp(oidc_harness):
    app, client, provider = oidc_harness
    await provision(app)
    provider.claim_overrides = {
        "aud": ["oneflow-web", "another-audience"],
        "azp": "oneflow-web",
    }
    query, _ = await start_login(client, provider)
    callback = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": query["state"][0], "code": "authorization-code"},
    )
    assert callback.status_code == 303
    assert (await client.get("/api/v1/me")).status_code == 200


async def test_oidc_unknown_or_inactive_account_is_not_auto_provisioned(oidc_harness):
    app, client, provider = oidc_harness
    await provision(app, active=False)
    query, _ = await start_login(client, provider)
    callback = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": query["state"][0], "code": "authorization-code"},
    )
    assert callback.headers["location"].endswith("/login?auth_error=account_unavailable")
    async with app.state.sessionmaker() as session:
        assert (await session.execute(select(OidcIdentity))).scalar_one_or_none() is None
        assert (await session.execute(select(AuthSession))).scalar_one_or_none() is None


async def test_oidc_rejects_invalid_nonce_audience_and_authorized_party(oidc_harness):
    app, client, provider = oidc_harness
    await provision(app)
    cases = [
        {"nonce": "wrong-nonce"},
        {"aud": "another-client"},
        {"aud": ["oneflow-web", "another-client"]},
        {"azp": "another-client"},
    ]
    for claims in cases:
        query, _ = await start_login(client, provider)
        provider.claim_overrides = claims
        callback = await client.get(
            "/api/v1/auth/oidc/callback",
            params={"state": query["state"][0], "code": "authorization-code"},
        )
        assert callback.headers["location"].endswith("/login?auth_error=provider_error")
        provider.claim_overrides = {}


async def test_oidc_rejects_remote_signing_key_headers(oidc_harness):
    app, client, provider = oidc_harness
    await provision(app)
    for header in (
        {"jku": "https://attacker.example/jwks"},
        {"x5u": "https://attacker.example/cert"},
    ):
        provider.header_overrides = header
        query, _ = await start_login(client, provider)
        callback = await client.get(
            "/api/v1/auth/oidc/callback",
            params={"state": query["state"][0], "code": "untrusted-key-location"},
        )
        assert callback.headers["location"].endswith("/login?auth_error=provider_error")
    provider.header_overrides = {}
    async with app.state.sessionmaker() as session:
        assert (await session.execute(select(AuthSession))).scalar_one_or_none() is None


async def test_oidc_unverified_email_cannot_create_binding_but_prelinked_subject_can_login(
    oidc_harness,
):
    app, client, provider = oidc_harness
    user = await provision(app)
    provider.email_verified = False
    query, _ = await start_login(client, provider)
    unverified = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": query["state"][0], "code": "authorization-code"},
    )
    assert unverified.headers["location"].endswith("/login?auth_error=account_unavailable")
    async with app.state.sessionmaker() as session:
        assert (await session.execute(select(OidcIdentity))).scalar_one_or_none() is None
        assert (await session.execute(select(AuthSession))).scalar_one_or_none() is None

    provider.email_verified = None
    query, _ = await start_login(client, provider)
    missing_verification = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": query["state"][0], "code": "authorization-code"},
    )
    assert missing_verification.headers["location"].endswith(
        "/login?auth_error=account_unavailable"
    )
    async with app.state.sessionmaker() as session, session.begin():
        assert (await session.execute(select(AuthSession))).scalar_one_or_none() is None
        session.add(
            OidcIdentity(
                issuer="https://idp.example.test",
                subject=provider.subject,
                user_id=user.id,
            )
        )

    query, _ = await start_login(client, provider)
    prelinked = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": query["state"][0], "code": "prelinked"},
    )
    assert prelinked.status_code == 303
    assert prelinked.headers["location"] == "https://oneflow.test/"
    assert (await client.get("/api/v1/me")).json()["email"] == user.email


async def test_oidc_provider_cancel_consumes_state(oidc_harness):
    _app, client, provider = oidc_harness
    query, _ = await start_login(client, provider)
    state = query["state"][0]
    cancelled = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": state, "error": "access_denied"},
    )
    assert cancelled.headers["location"].endswith("/login?auth_error=access_denied")
    replay = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": state, "code": "authorization-code"},
    )
    assert replay.headers["location"].endswith("/login?auth_error=invalid_state")


async def test_oidc_rejects_discovered_endpoint_outside_allowlist(oidc_harness):
    _app, client, provider = oidc_harness
    provider.metadata_overrides["token_endpoint"] = "https://attacker.example/token"
    response = await client.get("/api/v1/auth/oidc/start", params={"provider": "sso"})
    assert response.status_code == 503
    assert response.json()["detail"] == "identity provider is unavailable"


async def test_oidc_requires_discovered_issuer_to_match_exactly(oidc_harness):
    _app, client, provider = oidc_harness
    provider.metadata_overrides["issuer"] = "https://idp.example.test/"
    response = await client.get("/api/v1/auth/oidc/start", params={"provider": "sso"})
    assert response.status_code == 503


async def test_oidc_existing_subject_remains_stably_bound_when_email_changes(oidc_harness):
    app, client, provider = oidc_harness
    user = await provision(app)
    query, _ = await start_login(client, provider)
    first = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": query["state"][0], "code": "first"},
    )
    assert first.status_code == 303
    await client.post("/api/v1/auth/logout", headers={"Origin": "https://oneflow.test"})

    async with app.state.sessionmaker() as session, session.begin():
        await session.execute(
            update(User).where(User.id == user.id).values(email="renamed@example.test")
        )
    provider.email = "new-idp-address@example.test"
    query, _ = await start_login(client, provider)
    second = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": query["state"][0], "code": "second"},
    )
    assert second.status_code == 303
    assert (await client.get("/api/v1/me")).json()["email"] == "renamed@example.test"


async def test_oidc_start_normalizes_unsafe_next_path(oidc_harness):
    _app, client, provider = oidc_harness
    await provision(_app)
    query, _ = await start_login(client, provider, "https://attacker.example/phish")
    callback = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": query["state"][0], "code": "authorization-code"},
    )
    assert callback.headers["location"] == "https://oneflow.test/"


async def test_oidc_start_rejects_a_button_that_is_not_the_configured_provider(oidc_harness):
    _app, client, _provider = oidc_harness
    response = await client.get("/api/v1/auth/oidc/start", params={"provider": "google"})
    assert response.status_code == 404
    assert response.json()["detail"] == "oidc provider is unavailable"


async def test_oidc_start_requires_provider_classification(oidc_harness):
    _app, client, _provider = oidc_harness
    response = await client.get("/api/v1/auth/oidc/start")
    assert response.status_code == 422


async def test_oidc_start_preserves_a_safe_relative_fragment(oidc_harness):
    app, client, provider = oidc_harness
    await provision(app)
    query, _ = await start_login(client, provider, "/projects?view=board#focus")
    callback = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": query["state"][0], "code": "authorization-code"},
    )
    assert callback.headers["location"] == "https://oneflow.test/projects?view=board#focus"


async def test_oidc_multiple_providers_keep_start_callback_and_attempt_state_isolated(
    _prepare_database,
    _clean_tables,
):
    settings = make_oidc_provider_test_settings(
        oidc_sso_issuer="https://sso.example.test/realms/oneflow",
        oidc_sso_client_id="oneflow-sso",
        oidc_sso_client_secret="test-sso-secret",
        oidc_sso_redirect_uri="https://api.oneflow.test/api/v1/auth/oidc/callback",
        oidc_sso_allowed_hosts="",
        oidc_sso_allowed_email_domains="example.test",
    )
    app = create_app(settings)
    google = MockOidcProvider(
        issuer="https://accounts.example.test",
        client_id="oneflow-google",
    )
    sso = MockOidcProvider(
        issuer="https://sso.example.test/realms/oneflow",
        client_id="oneflow-sso",
    )
    providers = {
        "accounts.example.test": google,
        "sso.example.test": sso,
    }
    provider_http = AsyncClient(
        transport=httpx.MockTransport(lambda request: providers[request.url.host](request))
    )
    app.state.oidc_http_client = provider_http
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(
            transport=transport,
            base_url="https://api.oneflow.test",
            follow_redirects=False,
        ) as google_browser,
        AsyncClient(
            transport=transport,
            base_url="https://api.oneflow.test",
            follow_redirects=False,
        ) as sso_browser,
    ):
        config = (await google_browser.get("/api/v1/auth/config")).json()
        assert config["oidc_providers"] == ["google", "sso"]
        assert config["oidc_provider"] is None
        assert config["oidc_issuer"] is None
        await provision(app)

        google.claim_overrides = {"hd": "another.example"}
        rejected_query, _ = await start_login(google_browser, google, provider_alias="google")
        rejected = await google_browser.get(
            "/api/v1/auth/oidc/callback",
            params={"state": rejected_query["state"][0], "code": "wrong-hosted-domain"},
        )
        assert rejected.headers["location"].endswith("/login?auth_error=account_unavailable")
        google.claim_overrides = {"hd": "example.test"}

        google_query, google_start = await start_login(
            google_browser, google, provider_alias="google"
        )
        assert urlsplit(google_start.headers["location"]).hostname == "accounts.example.test"
        assert google_query["client_id"] == ["oneflow-google"]
        async with app.state.sessionmaker() as session:
            google_attempt = (
                await session.execute(
                    select(OidcLoginAttempt).where(
                        OidcLoginAttempt.state_hash
                        == hashlib.sha256(google_query["state"][0].encode()).hexdigest()
                    )
                )
            ).scalar_one()
            assert google_attempt.provider == "google"
            assert (
                google_attempt.config_fingerprint
                == settings.oidc_provider_config("google").config_fingerprint
            )

        sso_query, sso_start = await start_login(sso_browser, sso, provider_alias="sso")
        assert urlsplit(sso_start.headers["location"]).hostname == "sso.example.test"
        assert sso_query["client_id"] == ["oneflow-sso"]

        google_callback = await google_browser.get(
            "/api/v1/auth/oidc/callback",
            params={"state": google_query["state"][0], "code": "google-code"},
        )
        sso_callback = await sso_browser.get(
            "/api/v1/auth/oidc/callback",
            params={"state": sso_query["state"][0], "code": "sso-code"},
        )
        assert google_callback.headers["location"] == "https://oneflow.test/"
        assert sso_callback.headers["location"] == "https://oneflow.test/"
        async with app.state.sessionmaker() as session:
            identities = (await session.execute(select(OidcIdentity))).scalars().all()
            assert {identity.issuer for identity in identities} == {
                "https://accounts.example.test",
                "https://sso.example.test/realms/oneflow",
            }

        swapped_query, _ = await start_login(google_browser, google, provider_alias="google")
        async with app.state.sessionmaker() as session, session.begin():
            await session.execute(
                update(OidcLoginAttempt)
                .where(
                    OidcLoginAttempt.state_hash
                    == hashlib.sha256(swapped_query["state"][0].encode()).hexdigest()
                )
                .values(provider="sso")
            )
        swapped = await google_browser.get(
            "/api/v1/auth/oidc/callback",
            params={"state": swapped_query["state"][0], "code": "swapped"},
        )
        assert swapped.headers["location"].endswith("/login?auth_error=provider_error")
    await provider_http.aclose()
    await app.state.engine.dispose()


async def test_oidc_secret_rotation_invalidates_in_flight_attempt(oidc_harness):
    app, client, provider = oidc_harness
    await provision(app)
    query, _ = await start_login(client, provider)
    app.state.settings.oidc_client_secret = SecretStr("rotated-client-secret")
    callback = await client.get(
        "/api/v1/auth/oidc/callback",
        params={"state": query["state"][0], "code": "must-not-exchange"},
    )
    assert callback.headers["location"].endswith("/login?auth_error=provider_error")
    assert provider.last_token_form == {}


async def test_oidc_microsoft_requires_a_prelinked_subject(
    _prepare_database,
    _clean_tables,
):
    settings = make_oidc_provider_test_settings(
        oidc_google_issuer=None,
        oidc_google_client_id=None,
        oidc_google_client_secret=None,
        oidc_google_redirect_uri=None,
        oidc_google_allowed_hosts=None,
        oidc_google_allowed_email_domains=None,
        oidc_microsoft_issuer="https://login.microsoft.example/tenant/v2.0",
        oidc_microsoft_client_id="oneflow-microsoft",
        oidc_microsoft_client_secret="test-microsoft-secret",
        oidc_microsoft_redirect_uri="https://api.oneflow.test/api/v1/auth/oidc/callback",
        oidc_microsoft_allowed_hosts="",
        oidc_microsoft_allowed_email_domains="example.test",
    )
    app = create_app(settings)
    provider = MockOidcProvider(
        issuer="https://login.microsoft.example/tenant/v2.0",
        client_id="oneflow-microsoft",
    )
    provider_http = AsyncClient(transport=httpx.MockTransport(provider))
    app.state.oidc_http_client = provider_http
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="https://api.oneflow.test",
        follow_redirects=False,
    ) as client:
        user = await provision(app)
        query, _ = await start_login(client, provider, provider_alias="microsoft")
        unknown = await client.get(
            "/api/v1/auth/oidc/callback",
            params={"state": query["state"][0], "code": "unknown-subject"},
        )
        assert unknown.headers["location"].endswith("/login?auth_error=account_unavailable")
        async with app.state.sessionmaker() as session, session.begin():
            session.add(
                OidcIdentity(
                    issuer=provider.issuer,
                    subject=provider.subject,
                    user_id=user.id,
                )
            )
        query, _ = await start_login(client, provider, provider_alias="microsoft")
        prelinked = await client.get(
            "/api/v1/auth/oidc/callback",
            params={"state": query["state"][0], "code": "prelinked-subject"},
        )
        assert prelinked.headers["location"] == "https://oneflow.test/"
        assert (await client.get("/api/v1/me")).json()["email"] == user.email
    await provider_http.aclose()
    await app.state.engine.dispose()
