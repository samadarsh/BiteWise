import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.pantry.templates import get_category_default_expiry_days
from mcp.mcp_client import SwiggyFoodMCPClient


def _guest(client):
    token = client.post("/auth/guest").json()["session_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})


def test_long_keeping_items_do_not_expire_like_fresh_produce():
    assert get_category_default_expiry_days("Dairy", "Ghee") == 180
    assert get_category_default_expiry_days("Vegetables", "Onions") == 30
    assert get_category_default_expiry_days("Dairy", "Milk") == 4
    assert get_category_default_expiry_days("Staples", "Rice") is None


def test_request_bounds_are_enforced():
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as client:
        _guest(client)
        assert client.post("/household/members", json={"name": "A", "calorie_target": 10 ** 9}).status_code == 422
        assert client.post("/household/members", json={"name": "A", "dietary_preference": "carnivore"}).status_code == 422
        assert client.post("/coach/manual-entry", json={"meal_name": "x", "calories": 100, "protein_g": 5, "source": "order"}).status_code == 422
        assert client.post("/coach/manual-entry", json={"meal_name": "x", "calories": 100, "protein_g": 5, "source": "image_scan"}).status_code == 200
        assert client.get("/pantry/expiring", params={"days": -5}).status_code == 422


def test_live_coupons_flattened_from_sections():
    """fetch_food_coupons.md groups coupons as coupon_sections[].coupons[];
    the client read a flat "coupons" key and always returned []."""
    client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
    payload = {"success": True, "data": {
        "coupon_sections": [
            {"title": "Best", "coupons": [{"id": "A", "applicable": True}, {"id": "B", "applicable": False}]},
            {"title": "More", "coupons": [{"id": "C"}]},
        ],
        "summary": {"total_coupons": 3, "applicable_coupons": 2, "sections_count": 2},
    }}
    with patch.object(SwiggyFoodMCPClient, "call_tool", return_value=payload):
        coupons = client.fetch_food_coupons(restaurantId="r", addressId="a")
    assert [c["id"] for c in coupons] == ["A", "C"]


def test_per_user_mcp_tools_are_never_cached():
    """get_addresses({}) was cached process-wide for an hour, so every user
    got the first caller's addresses."""
    from agent.pipeline import NutriOrderPipeline

    class Client:
        def __init__(self, user):
            self.user = user

        def get_addresses(self):
            return [{"id": f"addr_of_{self.user}"}]

    a = NutriOrderPipeline(Client("alice"), None, None)._execute_mcp_call("get_addresses", {})
    b = NutriOrderPipeline(Client("bob"), None, None)._execute_mcp_call("get_addresses", {})
    assert a[0]["id"] == "addr_of_alice" and b[0]["id"] == "addr_of_bob"
