"""Global 500 policy + X-Request-ID contract (§5)."""


async def test_unhandled_exception_safe_500(app, client):
    async def boom():
        raise RuntimeError("sensitive internal detail")

    app.router.add_api_route("/api/v1/_boom", boom, methods=["GET"])
    res = await client.get("/api/v1/_boom")
    assert res.status_code == 500
    assert res.json() == {"detail": "internal server error"}  # no stacktrace leak
    assert "sensitive" not in res.text
    assert res.headers.get("x-request-id")  # correlation id present


async def test_valid_request_id_echoed(client):
    rid = "req-abc.123_XYZ"
    res = await client.get("/api/v1/healthz", headers={"X-Request-ID": rid})
    assert res.headers["x-request-id"] == rid


async def test_invalid_request_id_replaced(client):
    res = await client.get("/api/v1/healthz", headers={"X-Request-ID": "bad id!"})
    rid = res.headers["x-request-id"]
    assert rid != "bad id!" and len(rid) == 32  # server-generated uuid4 hex
