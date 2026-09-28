import os
import secrets
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import requests
from backend.main import app
from backend.db.session import SessionLocal
from backend.db.models import User, SwiggyToken, UserProfile
from backend.auth.sessions import decrypt_token, sign_oauth_state, sign_session


def _begin_swiggy_flow(client, user_id):
    """Sets the cookies /auth/swiggy/start would have set for user_id and
    returns the signed state to echo back — the callback now only trusts a
    state this server signed, never a hand-written one."""
    state = sign_oauth_state(user_id)
    client.cookies.set("oauth_state", state)
    client.cookies.set("oauth_code_verifier", "test_verifier")
    return state

def test_swiggy_oauth_start_sets_cookies_and_returns_url():
    """Verify that start endpoint sets PKCE cookies and returns correct auth URL with state."""
    with TestClient(app) as client:
        guest = client.post("/auth/guest").json()
        # Real mode sets Secure/SameSite=None cookies, which httpx's test
        # transport (http://testserver, not https) won't resend
        # automatically — authenticate via the Bearer token instead,
        # exactly like the real frontend does (frontend/lib/api.ts).
        auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}
        res = client.get("/auth/swiggy/start", headers=auth_headers)
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
    original_use_mock = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = "false"
    try:
        with TestClient(app) as client:
            # 1. Missing cookies (using return_json=true)
            res = client.get("/auth/swiggy/callback?code=real_code&state=mock_state&return_json=true")
            assert res.status_code == 400
            assert "state parameter mismatch" in res.json()["detail"]

            # 2. Mismatched state value
            client.cookies.set("oauth_state", "real_state")
            client.cookies.set("oauth_code_verifier", "real_verifier")
            res2 = client.get("/auth/swiggy/callback?code=real_code&state=fake_state&return_json=true")
            assert res2.status_code == 400
            assert "state parameter mismatch" in res2.json()["detail"]
            # Cookies must be cleared
            assert "oauth_state" not in res2.cookies
            assert "oauth_code_verifier" not in res2.cookies
    finally:
        if original_use_mock: os.environ["USE_MOCK_MCP"] = original_use_mock
        else: os.environ.pop("USE_MOCK_MCP", None)

def test_swiggy_oauth_callback_mock_mode_success():
    """Verify that mock callback succeeds only when linked to an active BiteWise user."""
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["USE_MOCK_MCP"] = "true"

    try:
        with TestClient(app) as client:
            guest_res = client.post("/auth/guest")
            guest_user_id = guest_res.json()["user_id"]
            state = _begin_swiggy_flow(client, guest_user_id)

            res = client.get("/auth/swiggy/callback", params={"code": "mock_code", "state": state, "return_json": "true"})
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

            state = _begin_swiggy_flow(client, stg_user_id)

            res = client.get("/auth/swiggy/callback", params={"code": "stg_code", "state": state, "return_json": "true"})
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is True

            # Verify requests.post parameters — matches authenticate.md's
            # documented token exchange body exactly: no client_id/secret,
            # PKCE's code_verifier is what proves client identity here.
            mock_post.assert_called_once()
            called_args, called_kwargs = mock_post.call_args
            assert called_kwargs["json"]["code_verifier"] == "test_verifier"
            assert called_kwargs["json"]["code"] == "stg_code"
            assert "client_id" not in called_kwargs["json"]
            assert "client_secret" not in called_kwargs["json"]

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

@patch("requests.post")
def test_swiggy_oauth_callback_real_exchange_even_with_app_env_development(mock_post):
    """Regression: APP_ENV=development (the default on any local dev machine)
    must never make the callback fabricate a mock token when USE_MOCK_MCP is
    explicitly false — that combination is exactly what real-mode testing
    from localhost looks like."""
    original_app_env = os.environ.get("APP_ENV")
    original_use_mock = os.environ.get("USE_MOCK_MCP")
    original_key = os.environ.get("ENCRYPTION_KEY")
    original_client_id = os.environ.get("SWIGGY_CLIENT_ID")

    os.environ["APP_ENV"] = "development"
    os.environ["USE_MOCK_MCP"] = "false"
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["SWIGGY_CLIENT_ID"] = "dev_real_client_id"

    mock_res = MagicMock()
    mock_res.status_code = 200
    mock_res.json.return_value = {
        "access_token": "real_dev_token_555",
        "expires_in": 3600,
        "scope": "mcp:tools"
    }
    mock_post.return_value = mock_res

    try:
        with TestClient(app) as client:
            dev_user_id = f"dev_user_{secrets.token_hex(4)}"
            db_setup = SessionLocal()
            try:
                db_setup.add(User(id=dev_user_id, auth_provider="google", email=f"{dev_user_id}@example.com"))
                db_setup.commit()
            finally:
                db_setup.close()

            state = _begin_swiggy_flow(client, dev_user_id)

            res = client.get("/auth/swiggy/callback", params={"code": "real_dev_code", "state": state, "return_json": "true"})
            assert res.status_code == 200
            data = res.json()

            mock_post.assert_called_once()

            db = SessionLocal()
            try:
                tok = db.query(SwiggyToken).filter(SwiggyToken.user_id == data["user_id"]).first()
                assert tok is not None
                decrypted = decrypt_token(tok.encrypted_access_token)
                assert decrypted == "real_dev_token_555"
                assert not decrypted.startswith("token_swiggy_")
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


def test_swiggy_oauth_callback_success_redirect():
    """Verify that successful oauth callback redirects to frontend app dashboard."""
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as client:
        guest_user_id = client.post("/auth/guest").json()["user_id"]
        state = _begin_swiggy_flow(client, guest_user_id)

        # Disable redirect following to inspect 307 redirect status
        res = client.get("/auth/swiggy/callback", params={"code": "mock_code", "state": state}, follow_redirects=False)
        assert res.status_code == 307
        assert "/app" in res.headers.get("location")
        assert "auth_error" not in res.headers.get("location")
        # The callback must never mint a login session (see the takeover
        # regression tests below) — the user is already logged in.
        assert "bitewise_session" not in res.cookies
        assert "nutriorder_session" not in res.cookies

def test_swiggy_oauth_callback_requires_bitewise_session():
    """Verify that a valid OAuth code cannot create a disconnected app user."""
    with TestClient(app) as client:
        client.cookies.set("oauth_state", "my_state")
        client.cookies.set("oauth_code_verifier", "my_verifier")

        res = client.get("/auth/swiggy/callback?code=mock_code&state=my_state&return_json=true")
        assert res.status_code == 401
        assert "BiteWise" in res.json()["detail"]

def test_swiggy_oauth_callback_failure_redirect():
    """Verify that failed oauth callback redirects to frontend app dashboard with error parameter."""
    with TestClient(app) as client:
        client.cookies.set("oauth_state", "my_state")
        client.cookies.set("oauth_code_verifier", "my_verifier")

        # Mismatched state in non-mock mode should trigger redirect failure
        original_use_mock = os.environ.get("USE_MOCK_MCP")
        os.environ["USE_MOCK_MCP"] = "false"
        try:
            res = client.get("/auth/swiggy/callback?code=real_code&state=bad_state", follow_redirects=False)
            assert res.status_code == 307
            assert "auth_error=" in res.headers.get("location")
            # Verify PKCE cookies are deleted
            assert "oauth_state" not in res.cookies
            assert "oauth_code_verifier" not in res.cookies
        finally:
            if original_use_mock: os.environ["USE_MOCK_MCP"] = original_use_mock
            else: os.environ.pop("USE_MOCK_MCP", None)


def _takeover_attempt(client, victim_id):
    """The old exploit: hand-write a state naming the victim, set a matching
    oauth_state cookie, and hit the callback."""
    forged = f"x:{victim_id}"
    client.cookies.set("oauth_state", forged)
    client.cookies.set("oauth_code_verifier", "anything")
    return client.get(
        "/auth/swiggy/callback",
        params={"code": "mock_code", "state": forged},
        follow_redirects=False,
    )


def test_forged_state_cannot_take_over_account_in_mock_mode():
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as victim, TestClient(app) as attacker:
        victim_id = victim.post("/auth/guest").json()["user_id"]
        res = _takeover_attempt(attacker, victim_id)
        assert "auth_error=" in res.headers.get("location", "")
        assert "bitewise_session" not in res.cookies
        assert attacker.get("/auth/me").json()["authenticated"] is False


def test_forged_state_cannot_take_over_account_in_live_mode():
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as victim:
        victim_id = victim.post("/auth/guest").json()["user_id"]
    os.environ["USE_MOCK_MCP"] = "false"
    with TestClient(app) as attacker:
        res = _takeover_attempt(attacker, victim_id)
        assert "auth_error=" in res.headers.get("location", "")
        assert "bitewise_session" not in res.cookies
    db = SessionLocal()
    try:
        assert db.query(SwiggyToken).filter(SwiggyToken.user_id == victim_id).first() is None
    finally:
        db.close()


def test_live_mode_never_fabricates_token_for_mock_code():
    """code=mock_code used to skip the real Swiggy exchange in live mode and
    save a fabricated token."""
    os.environ["USE_MOCK_MCP"] = "false"
    with TestClient(app) as client:
        user_id = f"live_user_{secrets.token_hex(4)}"
        db = SessionLocal()
        try:
            db.add(User(id=user_id, auth_provider="guest"))
            db.commit()
        finally:
            db.close()
        state = _begin_swiggy_flow(client, user_id)
        with patch("requests.post", side_effect=requests.exceptions.ConnectionError("no network in tests")) as mock_post:
            res = client.get("/auth/swiggy/callback", params={"code": "mock_code", "state": state, "return_json": "true"})
        mock_post.assert_called_once()
        assert res.status_code >= 400


def test_callback_rejects_state_for_a_different_logged_in_user():
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as client:
        other_id = client.post("/auth/guest").json()["user_id"]
        me_id = client.post("/auth/guest").json()["user_id"]  # browser now holds me_id's session
        client.cookies.set("bitewise_session", sign_session(me_id))
        state = _begin_swiggy_flow(client, other_id)
        res = client.get("/auth/swiggy/callback", params={"code": "mock_code", "state": state, "return_json": "true"})
        assert res.status_code == 401


def test_expired_state_is_rejected():
    import time as _time
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as client:
        user_id = client.post("/auth/guest").json()["user_id"]
        old_state = sign_oauth_state(user_id, now=_time.time() - 3600)
        client.cookies.set("oauth_state", old_state)
        res = client.get("/auth/swiggy/callback", params={"code": "mock_code", "state": old_state, "return_json": "true"})
        assert res.status_code == 401
