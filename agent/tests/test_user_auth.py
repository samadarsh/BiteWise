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

def test_unsigned_user_id_header_rejected_outside_mock_mode():
    """Security regression: get_current_user_id() previously trusted an
    unsigned x-user-id header whenever APP_ENV=development — the default on
    every dev machine and, critically, never overridden in this test suite —
    completely independent of USE_MOCK_MCP. That meant flipping USE_MOCK_MCP
    to false for a real deployment did nothing to stop identity spoofing via
    a raw header/query param. Must be rejected once USE_MOCK_MCP=false,
    regardless of APP_ENV; must still be accepted (dev convenience) when
    USE_MOCK_MCP=true."""
    original_use_mock = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = "true"
    try:
        with TestClient(app) as client:
            guest_res = client.post("/auth/guest")
            real_user_id = guest_res.json()["user_id"]
    finally:
        if original_use_mock is None:
            os.environ.pop("USE_MOCK_MCP", None)
        else:
            os.environ["USE_MOCK_MCP"] = original_use_mock

    os.environ["USE_MOCK_MCP"] = "false"
    try:
        with TestClient(app) as client:
            response = client.get("/auth/me", headers={"x-user-id": real_user_id})
            assert response.status_code == 200
            data = response.json()
            assert data["authenticated"] is False
    finally:
        if original_use_mock is None:
            os.environ.pop("USE_MOCK_MCP", None)
        else:
            os.environ["USE_MOCK_MCP"] = original_use_mock

    os.environ["USE_MOCK_MCP"] = "true"
    try:
        with TestClient(app) as client:
            response = client.get("/auth/me", headers={"x-user-id": real_user_id})
            assert response.status_code == 200
            data = response.json()
            assert data["authenticated"] is True
            assert data["user"]["id"] == real_user_id
    finally:
        if original_use_mock is None:
            os.environ.pop("USE_MOCK_MCP", None)
        else:
            os.environ["USE_MOCK_MCP"] = original_use_mock


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
