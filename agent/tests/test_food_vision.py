"""
Coverage for the food image scan feature: POST /coach/scan-food-image
(agent/food_vision.py, backend/coach/routes.py) and its extension of the
existing manual-entry save path (source="image_scan").
"""
import os
import secrets
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app
from agent.food_vision import FoodScanResult


def _auth_headers(client) -> dict:
    guest = client.post("/auth/guest").json()
    return {"Authorization": f"Bearer {guest['session_token']}"}


def _canned_result() -> FoodScanResult:
    return FoodScanResult(
        food_name="Grilled chicken bowl",
        description="Grilled chicken breast over rice with vegetables.",
        estimated_portion="about 1.5 cups",
        calories=420.0,
        protein_g=35.0,
        carbs_g=40.0,
        fat_g=10.0,
        confidence=0.72,
        micronutrients={"sodium": "~500mg", "fiber": "~4g"},
        caveats="Visual estimate from one photo, not a verified measurement.",
    )


@patch("agent.food_vision.genai.Client")
def test_scan_food_image_returns_analysis(mock_client_cls):
    os.environ["GEMINI_API_KEY"] = "test-key"

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.parsed = _canned_result()
    mock_client.models.generate_content.return_value = mock_response
    mock_client_cls.return_value = mock_client

    with TestClient(app) as client:
        headers = _auth_headers(client)
        res = client.post(
            "/coach/scan-food-image",
            headers=headers,
            files={"file": ("meal.jpg", b"\xff\xd8\xff\xe0fakejpegbytes", "image/jpeg")},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["food_name"] == "Grilled chicken bowl"
        assert data["calories"] == 420.0
        assert data["confidence"] == 0.72
        assert data["micronutrients"] == {"sodium": "~500mg", "fiber": "~4g"}

        # Confirm the image actually reached the Gemini call as inline bytes
        _, kwargs = mock_client.models.generate_content.call_args
        assert kwargs["config"].response_schema is FoodScanResult
        image_part = kwargs["contents"][1]
        assert image_part.inline_data.mime_type == "image/jpeg"
        assert image_part.inline_data.data == b"\xff\xd8\xff\xe0fakejpegbytes"


def test_scan_food_image_rejects_non_image_file():
    os.environ["GEMINI_API_KEY"] = "test-key"
    with TestClient(app) as client:
        headers = _auth_headers(client)
        res = client.post(
            "/coach/scan-food-image",
            headers=headers,
            files={"file": ("notes.txt", b"hello world", "text/plain")},
        )
        assert res.status_code == 400


def test_scan_food_image_disabled_without_api_key():
    os.environ.pop("GEMINI_API_KEY", None)
    with TestClient(app) as client:
        headers = _auth_headers(client)
        res = client.post(
            "/coach/scan-food-image",
            headers=headers,
            files={"file": ("meal.jpg", b"\xff\xd8\xff\xe0fakejpegbytes", "image/jpeg")},
        )
        assert res.status_code == 503


def test_scan_food_image_rejects_oversized_upload():
    os.environ["GEMINI_API_KEY"] = "test-key"
    with TestClient(app) as client:
        headers = _auth_headers(client)
        oversized = b"\xff\xd8\xff\xe0" + (b"0" * (9 * 1024 * 1024))  # 9MB > 8MB cap
        res = client.post(
            "/coach/scan-food-image",
            headers=headers,
            files={"file": ("meal.jpg", oversized, "image/jpeg")},
        )
        assert res.status_code == 413


def test_manual_entry_with_image_scan_source_round_trips():
    """Saving a reviewed scan result reuses POST /manual-entry — no second
    save path — with source/confidence/micronutrients threaded through
    correctly instead of the hardcoded manual-entry defaults."""
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["USE_MOCK_MCP"] = "true"

    try:
        with TestClient(app) as client:
            login = client.post("/auth/demo-login")
            assert login.status_code == 200

            payload = {
                "meal_name": "Grilled chicken bowl",
                "calories": 420.0,
                "protein_g": 35.0,
                "carbs_g": 40.0,
                "fat_g": 10.0,
                "source": "image_scan",
                "confidence": 0.72,
                "is_estimated": True,
                "micronutrients": {"sodium": "~500mg", "fiber": "~4g"},
            }
            res = client.post("/coach/manual-entry", json=payload)
            assert res.status_code == 200
            data = res.json()
            assert data["source"] == "image_scan"
            assert data["confidence"] == 0.72
            assert data["is_estimated"] is True
            assert data["micronutrients"] == {"sodium": "~500mg", "fiber": "~4g"}
            # A scanned entry shouldn't inherit manual-entry's placeholder label
            assert data["restaurant_name"] is None
    finally:
        if original_key is not None:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)


def test_manual_entry_default_source_unaffected():
    """The pre-existing manual-entry behavior (no source/confidence/etc.
    passed) must be exactly unchanged."""
    original_key = os.environ.get("ENCRYPTION_KEY")
    os.environ["ENCRYPTION_KEY"] = secrets.token_hex(32)
    os.environ["USE_MOCK_MCP"] = "true"

    try:
        with TestClient(app) as client:
            login = client.post("/auth/demo-login")
            assert login.status_code == 200

            res = client.post("/coach/manual-entry", json={
                "meal_name": "Boiled eggs",
                "calories": 140.0,
                "protein_g": 12.0,
            })
            assert res.status_code == 200
            data = res.json()
            assert data["source"] == "manual"
            assert data["confidence"] == 1.0
            assert data["is_estimated"] is False
            assert data["micronutrients"] is None
            assert data["restaurant_name"] == "Manual Entry"
    finally:
        if original_key is not None:
            os.environ["ENCRYPTION_KEY"] = original_key
        else:
            os.environ.pop("ENCRYPTION_KEY", None)
