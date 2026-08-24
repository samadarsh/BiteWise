"""
Regression coverage for the 3 Swiggy-auth gaps fixed this round:
  1. An expired token no longer showing as "connected".
  2. /auth/logout actually revoking/clearing the Swiggy-side token.
  3. A 401 from the Swiggy MCP layer reaching the client as a clean,
     structured error instead of being swallowed into a generic 500 or
     buried inside a 200 response.
"""
import datetime
import os
import secrets
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app
from backend.db.session import SessionLocal
from backend.db.models import User, SwiggyToken, DeliveryAddress
from backend.auth.sessions import encrypt_token


def _seed_token(user_id: str, expires_at: datetime.datetime) -> None:
    db = SessionLocal()
    try:
        db.add(SwiggyToken(
            user_id=user_id,
            encrypted_access_token=encrypt_token("some_token_value"),
            expires_at=expires_at,
            scope="mcp:tools",
        ))
        db.commit()
    finally:
        db.close()


def test_expired_swiggy_token_shows_not_connected():
    with TestClient(app) as client:
        guest = client.post("/auth/guest").json()
        user_id = guest["user_id"]
        # Real mode sets Secure/SameSite=None cookies, which httpx's test
        # transport (http://testserver, not https) won't resend
        # automatically — authenticate via the Bearer token instead,
        # exactly like the real frontend does (frontend/lib/api.ts).
        auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}
        _seed_token(user_id, datetime.datetime.now() - datetime.timedelta(days=1))

        res = client.get("/auth/me", headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["user"]["swiggy_connected"] is False


def test_valid_swiggy_token_shows_connected():
    with TestClient(app) as client:
        guest = client.post("/auth/guest").json()
        user_id = guest["user_id"]
        auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}
        _seed_token(user_id, datetime.datetime.now() + datetime.timedelta(days=5))

        res = client.get("/auth/me", headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["user"]["swiggy_connected"] is True


def test_me_reports_mcp_mode():
    # Explicit set/restore rather than relying on the ambient default — a
    # local .env with USE_MOCK_MCP=false (e.g. mid real-mode testing) would
    # otherwise make this test's expectation wrong, not the code.
    original_use_mock = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = "true"
    try:
        with TestClient(app) as client:
            client.post("/auth/guest")
            res = client.get("/auth/me")
            assert res.json()["user"]["mcp_mode"] == "mock"
    finally:
        if original_use_mock: os.environ["USE_MOCK_MCP"] = original_use_mock
        else: os.environ.pop("USE_MOCK_MCP", None)


def test_logout_deletes_swiggy_token_row():
    with TestClient(app) as client:
        guest = client.post("/auth/guest").json()
        user_id = guest["user_id"]
        auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}
        _seed_token(user_id, datetime.datetime.now() + datetime.timedelta(days=5))

        res = client.post("/auth/logout", headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["success"] is True

        db = SessionLocal()
        try:
            assert db.query(SwiggyToken).filter(SwiggyToken.user_id == user_id).first() is None
        finally:
            db.close()


@patch("backend.auth.user_auth.requests.post")
def test_logout_best_effort_revokes_in_real_mode(mock_post):
    original_use_mock = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = "false"
    mock_post.return_value = MagicMock(status_code=200)

    try:
        with TestClient(app) as client:
            guest = client.post("/auth/guest").json()
            user_id = guest["user_id"]
            # Real mode sets Secure/SameSite=None cookies, which httpx's test
            # transport (http://testserver, not https) won't resend
            # automatically — authenticate via the Bearer token instead,
            # exactly like the real frontend does (frontend/lib/api.ts).
            auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}
            _seed_token(user_id, datetime.datetime.now() + datetime.timedelta(days=5))

            res = client.post("/auth/logout", headers=auth_headers)
            assert res.status_code == 200
            mock_post.assert_called_once()
            _, kwargs = mock_post.call_args
            assert kwargs["headers"]["Authorization"].startswith("Bearer ")
    finally:
        if original_use_mock:
            os.environ["USE_MOCK_MCP"] = original_use_mock
        else:
            os.environ.pop("USE_MOCK_MCP", None)


@patch("backend.auth.user_auth.requests.post")
def test_logout_succeeds_even_if_swiggy_revoke_call_fails(mock_post):
    """The whole point of gap 2 being 'best-effort' — a dead/erroring Swiggy
    endpoint must never block a user from logging out of BiteWise."""
    original_use_mock = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = "false"
    mock_post.side_effect = ConnectionError("Swiggy is unreachable")

    try:
        with TestClient(app) as client:
            guest = client.post("/auth/guest").json()
            user_id = guest["user_id"]
            auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}
            _seed_token(user_id, datetime.datetime.now() + datetime.timedelta(days=5))

            res = client.post("/auth/logout", headers=auth_headers)
            assert res.status_code == 200
            assert res.json()["success"] is True

            db = SessionLocal()
            try:
                assert db.query(SwiggyToken).filter(SwiggyToken.user_id == user_id).first() is None
            finally:
                db.close()
    finally:
        if original_use_mock:
            os.environ["USE_MOCK_MCP"] = original_use_mock
        else:
            os.environ.pop("USE_MOCK_MCP", None)


@patch("agent.pipeline.NutriOrderPipeline.run_pipeline")
def test_expired_token_reaches_client_as_structured_401_not_buried_200(mock_run_pipeline):
    """Before this fix: agent/pipeline.py caught SwiggyAuthError internally and
    returned {"auth_required": True} inside a normal 200 response — the real
    signal was three levels deep in the body. Now it must surface as a clean
    401 with a machine-readable error_code the frontend can branch on."""
    mock_run_pipeline.return_value = {
        "success": False,
        "auth_required": True,
        "message": "Your Swiggy login session has expired. Please re-authenticate.",
    }

    with TestClient(app) as client:
        guest = client.post("/auth/guest").json()
        user_id = guest["user_id"]
        auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}

        db = SessionLocal()
        try:
            db.add(DeliveryAddress(
                user_id=user_id,
                address_id=f"addr_{secrets.token_hex(4)}",
                label="Home",
                display_text="123 Test St",
            ))
            db.commit()
        finally:
            db.close()

        res = client.post("/coach/next-meal", headers=auth_headers)
        assert res.status_code == 401
        body = res.json()
        assert body["error_code"] == "swiggy_reauth_required"
        assert "re-authenticate" in body["detail"].lower()


@patch("backend.mcp.swiggy_client.ProductionSwiggyClient.get_addresses")
def test_dead_token_purged_on_401_so_connected_status_updates_immediately(mock_get_addresses):
    """A token can go dead server-side (e.g. the user logs out of Swiggy
    directly) without BiteWise knowing until it's actually used. Before this
    fix, the stale row stayed in the DB until its natural expires_at, so
    swiggy_connected kept reporting True even after a real 401. The global
    handler must purge it the moment the 401 is seen."""
    from mcp.mcp_client import SwiggyAuthError
    mock_get_addresses.side_effect = SwiggyAuthError("Your Swiggy login session has expired. Please re-authenticate.")

    with TestClient(app) as client:
        guest = client.post("/auth/guest").json()
        user_id = guest["user_id"]
        auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}
        _seed_token(user_id, datetime.datetime.now() + datetime.timedelta(days=5))

        # Still shows connected — token hasn't been used yet, only checked by expiry.
        assert client.get("/auth/me", headers=auth_headers).json()["user"]["swiggy_connected"] is True

        res = client.get("/me/addresses", headers=auth_headers)
        assert res.status_code == 401
        assert res.json()["error_code"] == "swiggy_reauth_required"

        db = SessionLocal()
        try:
            assert db.query(SwiggyToken).filter(SwiggyToken.user_id == user_id).first() is None
        finally:
            db.close()

        assert client.get("/auth/me", headers=auth_headers).json()["user"]["swiggy_connected"] is False
