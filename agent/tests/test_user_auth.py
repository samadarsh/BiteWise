import pytest
import os
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from backend.main import app


def test_get_me_unauthenticated():
    with TestClient(app) as client:
        response = client.get("/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is False
        assert data["user"] is None

def test_guest_login():
    with TestClient(app) as client:
        response = client.post("/auth/guest")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["auth_provider"] == "guest"
        assert "bitewise_session" in response.cookies
        assert "nutriorder_session" in response.cookies

def test_google_login():
    original_use_mock = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = "true"
    # The unverified demo login only exists on an instance with no real
    # Google sign-in configured (see test_mock_google_login_disabled_...).
    os.environ.pop("GOOGLE_CLIENT_ID", None)
    try:
        with TestClient(app) as client:
            payload = {
                "id_token": "mock_google_token_123",
                "email": "testuser@gmail.com",
                "name": "Test User",
                "avatar_url": "https://example.com/avatar.png"
            }
            response = client.post("/auth/google", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["user"]["email"] == "testuser@gmail.com"
            assert data["user"]["auth_provider"] == "google"
            assert "bitewise_session" in response.cookies
            assert "nutriorder_session" in response.cookies
    finally:
        if original_use_mock is None:
            os.environ.pop("USE_MOCK_MCP", None)
        else:
            os.environ["USE_MOCK_MCP"] = original_use_mock


@patch("backend.auth.user_auth.requests.get")
def test_google_login_rejects_mock_token_outside_mock_mode(mock_get):
    """Security regression: the "mock_" token bypass previously fired
    whenever APP_ENV=development (the default on any local dev machine),
    completely regardless of USE_MOCK_MCP — meaning anyone could log in as
    an arbitrary fake Google account with zero verification while a real
    Swiggy session was live. Must be rejected once USE_MOCK_MCP=false — a
    "mock_"-prefixed token is no longer special-cased, it goes through the
    same real Google verification as any other token and fails on its merits
    (a malformed/fake token isn't a valid Google id_token)."""
    original_use_mock = os.environ.get("USE_MOCK_MCP")
    original_google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
    os.environ["USE_MOCK_MCP"] = "false"
    # Real verification only runs when a client ID is configured — without
    # this, an unset GOOGLE_CLIENT_ID (the .env.example default) takes the
    # "not configured" 500 branch instead of ever reaching requests.get,
    # which is what this test is actually exercising.
    os.environ["GOOGLE_CLIENT_ID"] = "expected-client-id"

    mock_response = MagicMock()
    mock_response.status_code = 400  # Google rejects a malformed/fake id_token
    mock_get.return_value = mock_response

    try:
        with TestClient(app) as client:
            payload = {
                "id_token": "mock_google_token_123",
                "email": "attacker@example.com",
                "name": "Attacker",
            }
            response = client.post("/auth/google", json=payload)
            assert response.status_code == 401
            # Confirms this went through real verification, not the bypass —
            # the mock_ prefix must not have short-circuited anything.
            mock_get.assert_called_once()
    finally:
        if original_use_mock is None:
            os.environ.pop("USE_MOCK_MCP", None)
        else:
            os.environ["USE_MOCK_MCP"] = original_use_mock
        if original_google_client_id is None:
            os.environ.pop("GOOGLE_CLIENT_ID", None)
        else:
            os.environ["GOOGLE_CLIENT_ID"] = original_google_client_id

@patch("backend.auth.user_auth.requests.get")
def test_google_login_rejects_audience_mismatch(mock_get):
    original_google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
    os.environ["GOOGLE_CLIENT_ID"] = "expected-client-id"

    try:
        with TestClient(app) as client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "aud": "wrong-client-id",
                "email": "attacker@example.com",
                "email_verified": "true",
            }
            mock_get.return_value = mock_response

            response = client.post("/auth/google", json={"id_token": "real_token"})
            assert response.status_code == 401
    finally:
        if original_google_client_id is None:
            os.environ.pop("GOOGLE_CLIENT_ID", None)
        else:
            os.environ["GOOGLE_CLIENT_ID"] = original_google_client_id

def test_unsigned_identity_rejected_in_every_mode():
    """Security regression: mock mode used to trust an unsigned x-user-id
    header, ?user_id= query, or raw cookie/Bearer value — so on the public
    demo instance anyone could act as any user by knowing their id."""
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as client:
        real_user_id = client.post("/auth/guest").json()["user_id"]

    for mode in ("true", "false"):
        os.environ["USE_MOCK_MCP"] = mode
        with TestClient(app) as client:
            for kwargs in (
                {"headers": {"x-user-id": real_user_id}},
                {"headers": {"Authorization": f"Bearer {real_user_id}"}},
                {"params": {"user_id": real_user_id}},
            ):
                data = client.get("/auth/me", **kwargs).json()
                assert data["authenticated"] is False, (mode, kwargs)
            client.cookies.set("bitewise_session", real_user_id)
            assert client.get("/auth/me").json()["authenticated"] is False


def test_mock_google_login_disabled_when_real_google_configured():
    """With a real GOOGLE_CLIENT_ID, real Google accounts exist on this
    instance — an unverified "mock_" token or bare email must not be able to
    log in as one of them, even in mock mode."""
    os.environ["USE_MOCK_MCP"] = "true"
    os.environ["GOOGLE_CLIENT_ID"] = "real-client-id"
    with TestClient(app) as client:
        res = client.post("/auth/google", json={"email": "victim@gmail.com"})
        assert res.status_code == 400
        with patch("backend.auth.user_auth.requests.get") as mock_get:
            mock_get.return_value = MagicMock(status_code=400)
            res = client.post("/auth/google", json={"id_token": "mock_x", "email": "victim@gmail.com"})
            assert res.status_code == 401


@patch("backend.auth.user_auth.requests.get")
def test_google_access_token_from_another_app_rejected(mock_get):
    """userinfo accepts any Google access token; the audience must be ours."""
    os.environ["USE_MOCK_MCP"] = "false"
    os.environ["GOOGLE_CLIENT_ID"] = "expected-client-id"
    mock_get.return_value = MagicMock(status_code=200, json=MagicMock(return_value={
        "aud": "some-other-app", "azp": "some-other-app",
        "email": "victim@gmail.com", "email_verified": "true",
    }))
    with TestClient(app) as client:
        res = client.post("/auth/google", json={"access_token": "ya29.token"})
        assert res.status_code == 401
        assert "audience" in res.json()["detail"].lower()


def test_guest_login_rate_limited_after_10_calls():
    """/auth/guest previously had no rate limit at all — unbounded account
    creation from a single client. Now shares the same 10-per-60s sliding
    window as other mutating routes."""
    with TestClient(app) as client:
        for _ in range(10):
            res = client.post("/auth/guest")
            assert res.status_code == 200
        res = client.post("/auth/guest")
        assert res.status_code == 429


def test_logout():
    with TestClient(app) as client:
        response = client.post("/auth/logout")
        assert response.status_code == 200
        assert response.json()["success"] is True


def _legacy_token(user_id):
    import hmac, hashlib
    from backend.auth.sessions import _get_session_secret
    return f"{user_id}.{hmac.new(_get_session_secret(), user_id.encode(), hashlib.sha256).hexdigest()}"


def test_session_tokens_expire():
    import time
    from backend.auth.sessions import sign_session, SESSION_TTL_SECONDS
    os.environ["USE_MOCK_MCP"] = "false"
    with TestClient(app) as client:
        user_id = client.post("/auth/guest").json()["user_id"]
        old_ms = int((time.time() - SESSION_TTL_SECONDS - 60) * 1000)
        stale = sign_session(user_id, issued_at_ms=old_ms)
    with TestClient(app) as fresh:
        me = fresh.get("/auth/me", headers={"Authorization": f"Bearer {stale}"}).json()
        assert me["authenticated"] is False


def test_logout_revokes_existing_tokens():
    """Regression: tokens were a bare HMAC of the user id, so a copied token
    (or the frontend's localStorage Bearer copy) kept working after logout."""
    os.environ["USE_MOCK_MCP"] = "false"
    with TestClient(app) as client:
        token = client.post("/auth/guest").json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/auth/me", headers=headers).json()["authenticated"] is True
        assert client.post("/auth/logout", headers=headers).status_code == 200
    with TestClient(app) as other:
        assert other.get("/auth/me", headers=headers).json()["authenticated"] is False
        assert other.get("/me/profile", headers=headers).status_code == 401


def test_legacy_token_still_works_and_is_renewed_until_logout():
    os.environ["USE_MOCK_MCP"] = "false"
    with TestClient(app) as client:
        user_id = client.post("/auth/guest").json()["user_id"]
    legacy = _legacy_token(user_id)
    with TestClient(app) as client:
        me = client.get("/auth/me", headers={"Authorization": f"Bearer {legacy}"}).json()
        assert me["authenticated"] is True and me["user"]["id"] == user_id
        renewed = me["session_token"]
        assert renewed and renewed.count(".") == 2
    with TestClient(app) as client:
        client.post("/auth/logout", headers={"Authorization": f"Bearer {renewed}"})
    with TestClient(app) as client:
        assert client.get("/auth/me", headers={"Authorization": f"Bearer {legacy}"}).json()["authenticated"] is False


def test_fresh_token_is_not_reissued_on_every_request():
    os.environ["USE_MOCK_MCP"] = "false"
    with TestClient(app) as client:
        token = client.post("/auth/guest").json()["session_token"]
        me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        assert me["authenticated"] is True
        assert me["session_token"] is None
