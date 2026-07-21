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

def test_logout():
    with TestClient(app) as client:
        response = client.post("/auth/logout")
        assert response.status_code == 200
        assert response.json()["success"] is True
