import os
import secrets
from fastapi.testclient import TestClient
from backend.main import app
from backend.db.session import SessionLocal
from backend.db.models import User, UserProfile, OrderSession, NutritionEntry, DeliveryAddress
from mcp.mcp_mock import MockSwiggyFoodMCP

def test_demo_endpoints_forbidden_in_production():
    """Verify that /demo/reset and /demo/seed raise 403 in production mode."""
    from backend.auth.sessions import get_current_user_id
    
    original_app_env = os.environ.get("APP_ENV")
    original_use_mock = os.environ.get("USE_MOCK_MCP")

    os.environ["APP_ENV"] = "production"
    os.environ["USE_MOCK_MCP"] = "false"

    # Override dependency to mock authenticated session
    app.dependency_overrides[get_current_user_id] = lambda: "user_test_prod"

    try:
        with TestClient(app) as client:
            res_reset = client.post("/demo/reset")
            assert res_reset.status_code == 403

            res_seed = client.post("/demo/seed")
            assert res_seed.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)
        
        if original_app_env:
            os.environ["APP_ENV"] = original_app_env
        else:
            os.environ.pop("APP_ENV", None)
        if original_use_mock:
            os.environ["USE_MOCK_MCP"] = original_use_mock
        else:
            os.environ.pop("USE_MOCK_MCP", None)

def test_demo_reset_and_seed_data_flow():
    """Verify that seeding populates all tables, and resetting wipes them clean."""
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["USE_MOCK_MCP"] = "true"
    os.environ["APP_ENV"] = "development"

    try:
        with TestClient(app) as client:
            client.post("/auth/demo-login")

            # Trigger seed
            seed_res = client.post("/demo/seed")
            assert seed_res.status_code == 200

            # Verify seeded profile
            profile_res = client.get("/me/profile")
            assert profile_res.status_code == 200
            assert profile_res.json()["age"] == 28

            # Verify seeded addresses
            addrs_res = client.get("/me/addresses")
            assert addrs_res.status_code == 200
            assert len(addrs_res.json()) >= 2

            # Verify seeded history
            history_res = client.get("/coach/history")
            assert history_res.status_code == 200
            assert len(history_res.json()) == 2

            # Trigger reset
            reset_res = client.post("/demo/reset")
            assert reset_res.status_code == 200

            # Verify profile reset to default (age is None)
            profile_res = client.get("/me/profile")
            assert profile_res.json()["age"] is None

            # Verify history wiped
            history_res = client.get("/coach/history")
            assert len(history_res.json()) == 0

    finally:
        if original_key:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)

def test_address_selection_persistence():
    """Verify that selecting an address upserts its metadata into delivery_addresses table."""
    db = SessionLocal()
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["USE_MOCK_MCP"] = "true"
    os.environ["APP_ENV"] = "development"

    try:
        with TestClient(app) as client:
            client.post("/auth/demo-login")

            # Start session
            start = client.post("/orders/session/start")
            session_id = start.json()["session_id"]

            # Select address Home (addr_home)
            select_res = client.post(
                f"/orders/session/{session_id}/select-address",
                params={"address_id": "addr_home"}
            )
            assert select_res.status_code == 200

            # Verify DeliveryAddress row created in DB
            session_rec = db.query(OrderSession).filter(OrderSession.id == session_id).first()
            user_id = session_rec.user_id

            addr_row = db.query(DeliveryAddress).filter(
                DeliveryAddress.user_id == user_id,
                DeliveryAddress.address_id == "addr_home"
            ).first()
            assert addr_row is not None
            assert addr_row.label == "Home"
            assert "Green Glen" in addr_row.display_text

    finally:
        db.close()
        if original_key:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)
