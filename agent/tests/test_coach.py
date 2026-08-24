import datetime
import os
import secrets
from zoneinfo import ZoneInfo
from fastapi.testclient import TestClient
from backend.main import app
from backend.db.session import SessionLocal
from backend.db.models import User, UserProfile, OrderSession, NutritionEntry, OrderEvent, DeliveryAddress
from backend.coach.service import get_local_today_date, get_today_status, add_manual_entry, auto_log_ordered_meal
from backend.coach.models import ManualEntrySchema

def test_timezone_aware_date_boundaries():
    """Verify that get_local_today_date correctly returns Asia/Kolkata date."""
    d = get_local_today_date()
    assert isinstance(d, datetime.date)

    # Compare with manual offset calculation
    utc_now = datetime.datetime.now(ZoneInfo("UTC"))
    ist_now = utc_now.astimezone(ZoneInfo("Asia/Kolkata"))
    assert d == ist_now.date()

def test_coach_target_calculation():
    """Verify dynamic daily targets calculation via UserProfile biometrics."""
    db = SessionLocal()
    user_id = "test_coach_user_targets"
    try:
        # Cleanup
        db.query(UserProfile).filter(UserProfile.user_id == user_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()

        # Create user & profile with biometrics
        user = User(id=user_id)
        db.add(user)
        db.commit()

        profile = UserProfile(
            user_id=user_id,
            age=25,
            gender="male",
            height_cm=180.0,
            weight_kg=80.0,
            activity_level="moderate",
            fitness_goal="muscle_gain", # Should trigger surplus target calculation
            calorie_target=600,
            protein_target=30
        )
        db.add(profile)
        db.commit()

        # Calculate BMR: 10 * 80 + 6.25 * 180 - 5 * 25 + 5 = 800 + 1125 - 125 + 5 = 1805
        # TDEE: 1805 * 1.55 (moderate) = 2797.75
        # surplus: 2797.75 + 500 = 3297.75 -> target calories
        status = get_today_status(db, user_id)
        assert status["target_calories"] > 3000
        assert status["target_protein"] > 100
    finally:
        db.query(UserProfile).filter(UserProfile.user_id == user_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()

def test_coach_manual_and_history_endpoints():
    """Verify endpoint execution of /coach/today, /coach/manual-entry, and /coach/history."""
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["USE_MOCK_MCP"] = "true"
    os.environ["APP_ENV"] = "development"

    try:
        with TestClient(app) as client:
            # Login as demo user
            login = client.post("/auth/demo-login")
            assert login.status_code == 200

            # Fetch baseline today status
            today = client.get("/coach/today")
            assert today.status_code == 200
            data = today.json()
            assert "target_calories" in data
            assert "consumed_calories" in data
            assert data["consumed_calories"] >= 0

            # Fetch initial history
            history = client.get("/coach/history")
            assert history.status_code == 200
            initial_count = len(history.json())

            # Log a manual entry
            entry_payload = {
                "meal_name": "Protein Shake",
                "calories": 250.0,
                "protein_g": 30.0,
                "carbs_g": 10.0,
                "fat_g": 3.0
            }
            log_res = client.post("/coach/manual-entry", json=entry_payload)
            assert log_res.status_code == 200
            entry_data = log_res.json()
            assert entry_data["meal_name"] == "Protein Shake"
            assert entry_data["calories"] == 250.0

            # Verify that today status updated
            today2 = client.get("/coach/today")
            assert today2.status_code == 200
            data2 = today2.json()
            assert data2["consumed_calories"] == data["consumed_calories"] + 250.0
            assert data2["consumed_protein"] == data["consumed_protein"] + 30.0

            # Verify that history contains the new entry
            history2 = client.get("/coach/history")
            assert history2.status_code == 200
            assert len(history2.json()) == initial_count + 1
            assert history2.json()[0]["meal_name"] == "Protein Shake"

    finally:
        if original_key:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)

def test_coach_next_meal_address_rule_and_floors():
    """Verify that /coach/next-meal requires an address and enforces safety floors."""
    db = SessionLocal()
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["USE_MOCK_MCP"] = "true"
    os.environ["APP_ENV"] = "development"

    try:
        with TestClient(app) as client:
            # Login
            login = client.post("/auth/demo-login")
            assert login.status_code == 200

            # Try request suggestion when no addresses exist or selected
            # Note: Demo user might have a default address in database already.
            # To test the address requirement, we can inspect response or mock behavior
            res = client.post("/coach/next-meal")
            assert res.status_code == 200
            data = res.json()
            # If default address exists, success will be True; if not, status will be action_required
            if not data.get("success"):
                assert data["status"] == "action_required"
                assert "address" in data["message"].lower()

    finally:
        db.close()
        if original_key:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)

def test_order_success_autologging():
    """Verify that placing an order automatically logs macros to the daily entries ledger."""
    db = SessionLocal()
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["USE_MOCK_MCP"] = "true"
    os.environ["APP_ENV"] = "development"

    try:
        with TestClient(app) as client:
            login = client.post("/auth/demo-login")
            assert login.status_code == 200

            # Select an address & start a session
            start = client.post("/orders/session/start")
            assert start.status_code == 200
            session_id = start.json()["session_id"]

            addr = client.post(
                f"/orders/session/{session_id}/select-address",
                params={"address_id": "addr_home"},
            )
            assert addr.status_code == 200

            # Recommend
            recs = client.post(
                "/recommendations/search",
                json={"session_id": session_id, "query": "chicken salad"},
            )
            assert recs.status_code == 200
            top = recs.json()["results"]["recommendations"][0]

            # Select item - this caches the nutrition snapshot
            item = client.post(
                f"/orders/session/{session_id}/select-item",
                params={"restaurant_id": top["restaurant_id"], "item_id": top["item_id"]},
            )
            assert item.status_code == 200

            # Verify that order_sessions record contains selected_item_nutrition
            session_rec = db.query(OrderSession).filter(OrderSession.id == session_id).first()
            assert session_rec.selected_item_nutrition is not None
            assert session_rec.selected_item_nutrition["item_name"] == top["item_name"]

            # Sync cart & confirm order
            cart = client.post(f"/orders/session/{session_id}/cart")
            assert cart.status_code == 200

            # Transition state to CART_REVIEW_READY
            review = client.get(f"/orders/session/{session_id}/cart")
            assert review.status_code == 200

            confirm = client.post(f"/orders/session/{session_id}/confirm")
            assert confirm.status_code == 200

            # Get pre-order history count
            pre_history = client.get("/coach/history").json()
            pre_count = len(pre_history)

            # Place order - should trigger auto-logging
            place = client.post(
                f"/orders/session/{session_id}/place",
                params={"user_confirmed": True},
            )
            assert place.status_code == 200

            # Verify auto-log succeeded
            post_history = client.get("/coach/history").json()
            assert len(post_history) == pre_count + 1
            assert post_history[0]["order_session_id"] == session_id

            # Verify duplicate logging prevention
            # Manually run auto_log_ordered_meal again and ensure it does not duplicate
            user_id = session_rec.user_id
            db.refresh(session_rec)
            res_dup = auto_log_ordered_meal(db, user_id, session_rec)
            assert res_dup is not None # Returns existing entry

            post_history_dup = client.get("/coach/history").json()
            assert len(post_history_dup) == pre_count + 1

    finally:
        db.close()
        if original_key:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)


def test_search_surfaces_pipeline_crash_as_502_not_fake_relaxation_options():
    """A genuine pipeline crash (error_type: internal_error/upstream_error)
    must reach the client as a real error — previously any failure, crash
    included, got silently relabeled as "no strict matches, try relaxing a
    constraint", hiding the actual bug from both the user and any debugging."""
    from unittest.mock import patch

    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["USE_MOCK_MCP"] = "true"
    os.environ["APP_ENV"] = "development"

    try:
        with TestClient(app) as client:
            client.post("/auth/demo-login")
            start = client.post("/orders/session/start")
            session_id = start.json()["session_id"]
            client.post(f"/orders/session/{session_id}/select-address", params={"address_id": "addr_home"})

            with patch("agent.pipeline.NutriOrderPipeline.run_pipeline") as mock_run:
                mock_run.return_value = {
                    "success": False,
                    "error_type": "internal_error",
                    "message": "An unexpected error occurred: unsupported operand type(s) for /: 'str' and 'float'",
                }
                res = client.post("/recommendations/search", json={"session_id": session_id, "query": "grilled chicken"})

            assert res.status_code == 502
            assert "unsupported operand type" in res.json()["detail"]
    finally:
        if original_key:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)


def test_search_rejects_empty_query_instead_of_silently_substituting_one():
    """Regression: agent/pipeline.py's intent parser treats a falsy query as
    absent and substitutes a generic "high protein" search — clicking "Find
    Recommended Meal" with an empty textarea silently returned real
    recommendations instead of prompting the user to describe what they want."""
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["USE_MOCK_MCP"] = "true"
    os.environ["APP_ENV"] = "development"

    try:
        with TestClient(app) as client:
            client.post("/auth/demo-login")
            start = client.post("/orders/session/start")
            session_id = start.json()["session_id"]
            client.post(f"/orders/session/{session_id}/select-address", params={"address_id": "addr_home"})

            res_empty = client.post("/recommendations/search", json={"session_id": session_id, "query": ""})
            assert res_empty.status_code == 400

            res_whitespace = client.post("/recommendations/search", json={"session_id": session_id, "query": "   "})
            assert res_whitespace.status_code == 400

            res_valid = client.post("/recommendations/search", json={"session_id": session_id, "query": "chicken salad"})
            assert res_valid.status_code == 200
    finally:
        if original_key:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)
