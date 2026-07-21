import os
import secrets
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import requests
from backend.main import app
from backend.db.session import SessionLocal
from backend.db.models import User, SwiggyToken, UserProfile
from backend.auth.sessions import decrypt_token

def test_swiggy_oauth_start_sets_cookies_and_returns_url():
    """Verify that start endpoint sets PKCE cookies and returns correct auth URL with state."""
    with TestClient(app) as client:
        client.post("/auth/guest")
        res = client.get("/auth/swiggy/start")
        assert res.status_code == 200
        data = res.json()
        assert "redirect_url" in data
        assert "code_challenge" in data

        # Cookies check
        cookies = res.cookies
        assert "oauth_code_verifier" in cookies
        assert "oauth_state" in cookies

def test_swiggy_oauth_start_requires_bitewise_session():
    """Verify that users must log into BiteWise before starting Swiggy linkage."""
    with TestClient(app) as client:
        res = client.get("/auth/swiggy/start")
        assert res.status_code == 401
        assert "unauthenticated" in res.json()["detail"].lower()

def test_swiggy_oauth_callback_state_verification():
    """Verify that callback endpoint rejects missing or mismatched state cookies."""
    with TestClient(app) as client:
        # 1. Missing cookies (using return_json=true)
        res = client.get("/auth/swiggy/callback?code=mock_code&state=mock_state&return_json=true")
        assert res.status_code == 400
        assert "state parameter mismatch" in res.json()["detail"]

        # 2. Mismatched state value
        client.cookies.set("oauth_state", "real_state")
        client.cookies.set("oauth_code_verifier", "real_verifier")
        res2 = client.get("/auth/swiggy/callback?code=mock_code&state=fake_state&return_json=true")
        assert res2.status_code == 400
        assert "state parameter mismatch" in res2.json()["detail"]
        # Cookies must be cleared
        assert "oauth_state" not in res2.cookies
        assert "oauth_code_verifier" not in res2.cookies

def test_swiggy_oauth_callback_mock_mode_success():
    """Verify that mock callback succeeds only when linked to an active BiteWise user."""
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)

    try:
        with TestClient(app) as client:
            guest_res = client.post("/auth/guest")
            guest_user_id = guest_res.json()["user_id"]
            client.cookies.set("oauth_state", "my_state")
            client.cookies.set("oauth_code_verifier", "my_verifier")

            res = client.get("/auth/swiggy/callback?code=mock_code&state=my_state&return_json=true")
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is True
            assert "user_id" in data

            # Verify cookies are wiped
            assert "oauth_state" not in res.cookies
            assert "oauth_code_verifier" not in res.cookies

            # Verify DB tables populated
            db = SessionLocal()
            try:
                user_id = data["user_id"]
                assert user_id == guest_user_id
                user = db.query(User).filter(User.id == user_id).first()
                assert user is not None
                
                profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
                assert profile is not None

                tok = db.query(SwiggyToken).filter(SwiggyToken.user_id == user_id).first()
                assert tok is not None
                assert tok.scope == "mcp:tools"
                decrypted = decrypt_token(tok.encrypted_access_token)
                assert decrypted.startswith("token_swiggy_")
            finally:
                db.close()
    finally:
        if original_key:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)

@patch("requests.post")
def test_swiggy_oauth_callback_production_token_exchange(mock_post):
    """Verify that production mode exchanges code with JSON body and saves returned tokens."""
    original_app_env = os.environ.get("APP_ENV")
    original_use_mock = os.environ.get("USE_MOCK_MCP")
    original_key = os.environ.get("ENCRYPTION_KEY")
    original_client_id = os.environ.get("SWIGGY_CLIENT_ID")
    original_client_secret = os.environ.get("SWIGGY_CLIENT_SECRET")

    os.environ["APP_ENV"] = "staging"
    os.environ["USE_MOCK_MCP"] = "false"
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["SWIGGY_CLIENT_ID"] = "stg_client_id"
    os.environ["SWIGGY_CLIENT_SECRET"] = "stg_client_secret"

    # Mock response from Swiggy token url
    mock_res = MagicMock()
    mock_res.status_code = 200
    mock_res.json.return_value = {
        "access_token": "live_staging_token_999",
        "expires_in": 3600,
        "scope": "mcp:tools"
    }
    mock_post.return_value = mock_res

    try:
        with TestClient(app) as client:
            stg_user_id = f"stg_user_{secrets.token_hex(4)}"
            db_setup = SessionLocal()
            try:
                stg_user = User(
                    id=stg_user_id,
                    auth_provider="google",
                    email=f"{stg_user_id}@example.com"
                )
                db_setup.add(stg_user)
                db_setup.commit()
            finally:
                db_setup.close()

            client.cookies.set("bitewise_session", stg_user_id)
            client.cookies.set("oauth_state", "stg_state")
            client.cookies.set("oauth_code_verifier", "stg_verifier")

            res = client.get("/auth/swiggy/callback?code=stg_code&state=stg_state&return_json=true")
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is True

            # Verify requests.post parameters
            mock_post.assert_called_once()
            called_args, called_kwargs = mock_post.call_args
            assert called_kwargs["json"]["code_verifier"] == "stg_verifier"
            assert called_kwargs["json"]["code"] == "stg_code"
            assert called_kwargs["json"]["client_id"] == "stg_client_id"
            assert called_kwargs["json"]["client_secret"] == "stg_client_secret"

            # Verify saved token in DB
            db = SessionLocal()
            try:
                user_id = data["user_id"]
                tok = db.query(SwiggyToken).filter(SwiggyToken.user_id == user_id).first()
                assert tok is not None
                decrypted = decrypt_token(tok.encrypted_access_token)
                assert decrypted == "live_staging_token_999"
            finally:
                db.close()
    finally:
        if original_app_env: os.environ["APP_ENV"] = original_app_env
        else: os.environ.pop("APP_ENV", None)
        if original_use_mock: os.environ["USE_MOCK_MCP"] = original_use_mock
        else: os.environ.pop("USE_MOCK_MCP", None)
        if original_key: os.environ["ENCRYPTION_KEY"] = original_key
        else: os.environ.pop("ENCRYPTION_KEY", None)
        if original_client_id: os.environ["SWIGGY_CLIENT_ID"] = original_client_id
        else: os.environ.pop("SWIGGY_CLIENT_ID", None)
        if original_client_secret: os.environ["SWIGGY_CLIENT_SECRET"] = original_client_secret
        else: os.environ.pop("SWIGGY_CLIENT_SECRET", None)

def test_swiggy_oauth_callback_success_redirect():
    """Verify that successful oauth callback redirects to frontend app dashboard."""
    with TestClient(app) as client:
        client.post("/auth/guest")
        client.cookies.set("oauth_state", "my_state")
        client.cookies.set("oauth_code_verifier", "my_verifier")

        # Disable redirect following to inspect 307 redirect status
        res = client.get("/auth/swiggy/callback?code=mock_code&state=my_state", follow_redirects=False)
        assert res.status_code == 307
        assert "/app" in res.headers.get("location")
        assert "bitewise_session" in res.cookies
        assert "nutriorder_session" in res.cookies

def test_swiggy_oauth_callback_requires_bitewise_session():
    """Verify that a valid OAuth code cannot create a disconnected app user."""
    with TestClient(app) as client:
        client.cookies.set("oauth_state", "my_state")
        client.cookies.set("oauth_code_verifier", "my_verifier")

        res = client.get("/auth/swiggy/callback?code=mock_code&state=my_state&return_json=true")
        assert res.status_code == 401
        assert "BiteWise" in res.json()["detail"]

def test_swiggy_oauth_callback_failure_redirect():
    """Verify that failed oauth callback redirects to frontend landing page with error parameter."""
    with TestClient(app) as client:
        client.cookies.set("oauth_state", "my_state")
        client.cookies.set("oauth_code_verifier", "my_verifier")

        # Mismatched state should trigger redirect failure
        res = client.get("/auth/swiggy/callback?code=mock_code&state=bad_state", follow_redirects=False)
        assert res.status_code == 307
        assert "/?auth_error=" in res.headers.get("location")
        # Verify PKCE cookies are deleted
        assert "oauth_state" not in res.cookies
        assert "oauth_code_verifier" not in res.cookies
