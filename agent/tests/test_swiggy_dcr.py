"""
Regression coverage for Dynamic Client Registration (RFC 7591, POST
/auth/register) — the piece that lets BiteWise self-register a client_id on
localhost instead of requiring a manually-issued SWIGGY_CLIENT_ID from a
builders@swiggy.in production application (per authenticate.md: "You don't
need to apply for or manage a client identity").
"""
import os
import secrets
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app
from backend.db.session import SessionLocal, Base, engine
from backend.db.models import SwiggyClientRegistration

# Table creation normally happens on FastAPI's startup event (main.py), which
# only fires once a TestClient context is entered — but these helpers may run
# before that (to clear state ahead of opening the client), so ensure it here.
Base.metadata.create_all(bind=engine)


def _set_real_mode():
    original = {
        "USE_MOCK_MCP": os.environ.get("USE_MOCK_MCP"),
        "SWIGGY_CLIENT_ID": os.environ.get("SWIGGY_CLIENT_ID"),
    }
    os.environ["USE_MOCK_MCP"] = "false"
    os.environ.pop("SWIGGY_CLIENT_ID", None)
    return original


def _restore(original):
    for key, val in original.items():
        if val is not None:
            os.environ[key] = val
        else:
            os.environ.pop(key, None)


def _clear_registration(redirect_uri: str) -> None:
    db = SessionLocal()
    try:
        db.query(SwiggyClientRegistration).filter(
            SwiggyClientRegistration.redirect_uri == redirect_uri
        ).delete()
        db.commit()
    finally:
        db.close()


@patch("requests.post")
def test_dcr_registers_and_caches_client(mock_post):
    """No SWIGGY_CLIENT_ID, no cached row -> calls /auth/register, uses the
    returned client_id in the authorize URL, and persists it for reuse."""
    original = _set_real_mode()
    from config.settings import get_settings
    _clear_registration(get_settings().swiggy_redirect_uri)

    mock_res = MagicMock()
    mock_res.status_code = 201
    mock_res.json.return_value = {"client_id": "dcr_client_abc123"}
    mock_post.return_value = mock_res

    try:
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
            assert "client_id=dcr_client_abc123" in data["redirect_url"]

            mock_post.assert_called_once()
            _, kwargs = mock_post.call_args
            assert kwargs["json"]["token_endpoint_auth_method"] == "none"
            assert kwargs["json"]["redirect_uris"] == [get_settings().swiggy_redirect_uri]

            db = SessionLocal()
            try:
                row = db.query(SwiggyClientRegistration).filter(
                    SwiggyClientRegistration.redirect_uri == get_settings().swiggy_redirect_uri
                ).first()
                assert row is not None
                assert row.client_id == "dcr_client_abc123"
            finally:
                db.close()
    finally:
        _clear_registration(get_settings().swiggy_redirect_uri)
        _restore(original)


@patch("requests.post")
def test_dcr_reuses_cached_client_without_reregistering(mock_post):
    """A second /auth/swiggy/start call must not hit /auth/register again."""
    original = _set_real_mode()
    from config.settings import get_settings
    redirect_uri = get_settings().swiggy_redirect_uri
    _clear_registration(redirect_uri)

    db = SessionLocal()
    try:
        db.add(SwiggyClientRegistration(redirect_uri=redirect_uri, client_id="cached_client_xyz"))
        db.commit()
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            guest = client.post("/auth/guest").json()
            auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}
            res = client.get("/auth/swiggy/start", headers=auth_headers)
            assert res.status_code == 200
            assert "client_id=cached_client_xyz" in res.json()["redirect_url"]
            mock_post.assert_not_called()
    finally:
        _clear_registration(redirect_uri)
        _restore(original)


@patch("requests.post")
def test_dcr_failure_returns_503(mock_post):
    """A dead/erroring Swiggy /auth/register must surface as a clean 503, not
    a generic 500 or a silent fallback to an unusable client_id."""
    original = _set_real_mode()
    from config.settings import get_settings
    _clear_registration(get_settings().swiggy_redirect_uri)
    mock_post.side_effect = ConnectionError("Swiggy is unreachable")

    try:
        with TestClient(app) as client:
            client.post("/auth/guest")
            res = client.get("/auth/swiggy/start")
            assert res.status_code == 503
            assert "Dynamic Client Registration" in res.json()["detail"]
    finally:
        _clear_registration(get_settings().swiggy_redirect_uri)
        _restore(original)


@patch("requests.post")
def test_manual_client_id_takes_precedence_over_dcr(mock_post):
    """A manually-configured SWIGGY_CLIENT_ID (real builders@swiggy.in
    application) must win over DCR and never trigger a register call."""
    original = _set_real_mode()
    os.environ["SWIGGY_CLIENT_ID"] = "manually_issued_client"
    from config.settings import get_settings
    _clear_registration(get_settings().swiggy_redirect_uri)

    try:
        with TestClient(app) as client:
            guest = client.post("/auth/guest").json()
            auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}
            res = client.get("/auth/swiggy/start", headers=auth_headers)
            assert res.status_code == 200
            assert "client_id=manually_issued_client" in res.json()["redirect_url"]
            mock_post.assert_not_called()
    finally:
        _clear_registration(get_settings().swiggy_redirect_uri)
        _restore(original)


def test_swiggy_status_reports_dcr_readiness():
    original = _set_real_mode()
    from config.settings import get_settings
    redirect_uri = get_settings().swiggy_redirect_uri
    _clear_registration(redirect_uri)

    try:
        with TestClient(app) as client:
            res = client.get("/auth/swiggy/status")
            assert res.status_code == 200
            data = res.json()
            assert data["client_id_source"] == "not_yet_registered"
            assert data["client_id_configured"] is False

            db = SessionLocal()
            try:
                db.add(SwiggyClientRegistration(redirect_uri=redirect_uri, client_id=f"c_{secrets.token_hex(4)}"))
                db.commit()
            finally:
                db.close()

            res2 = client.get("/auth/swiggy/status")
            data2 = res2.json()
            assert data2["client_id_source"] == "dynamic_registration_cached"
            assert data2["client_id_configured"] is True
    finally:
        _clear_registration(redirect_uri)
        _restore(original)
