"""Live-mode Instamart checkout safety, against a fake Swiggy client —
nothing here talks to real Swiggy."""
import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app


class FakeInstamart:
    def __init__(self, cart_response=None, checkout_response=None):
        self.cart_response = cart_response or {}
        self.checkout_response = checkout_response or {"orderId": "im_1", "status": "CONFIRMED"}
        self.update_calls = []
        self.checkout_calls = 0

    def update_cart(self, addressId, items):
        self.update_calls.append(items)
        return self.cart_response

    def checkout(self, addressId, paymentMethod="Cash"):
        self.checkout_calls += 1
        return self.checkout_response


def _live_env():
    os.environ["USE_MOCK_MCP"] = "false"
    os.environ["SWIGGY_ENV"] = "staging"
    os.environ["ALLOW_PLACE_ORDER"] = "true"


def _guest_with_items(client, *names):
    token = client.post("/auth/guest").json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    for name in names:
        client.post("/grocery-list/items", json={"item_name": name}, headers=headers)
    return headers


def _catalog(prices):
    def match(item_name, user_id, address_id):
        if item_name in prices:
            return {"name": item_name, "price": prices[item_name], "spinId": f"spin_{item_name}"}
        return None
    return match


def test_live_checkout_refuses_items_with_no_real_product():
    _live_env()
    fake = FakeInstamart()
    with TestClient(app) as client, \
            patch("backend.grocery.routes._match_catalog_product_live", side_effect=_catalog({"Milk": 150})), \
            patch("backend.grocery.routes.ProductionSwiggyInstamartClient", return_value=fake):
        headers = _guest_with_items(client, "Milk", "Unobtainium")
        res = client.post("/grocery-list/checkout", json={"address_id": "a1"}, headers=headers)
        assert res.status_code == 400
        assert "Unobtainium" in res.json()["detail"]
        assert fake.update_calls == []  # never sent generic_ ids to a real cart


def test_live_checkout_enforces_cap_on_real_cart_total():
    _live_env()
    fake = FakeInstamart(cart_response={"cartTotalAmount": "1049", "billBreakdown": {"toPay": {"label": "To Pay", "value": "1049"}}})
    with TestClient(app) as client, \
            patch("backend.grocery.routes._match_catalog_product_live", side_effect=_catalog({"Milk": 150})), \
            patch("backend.grocery.routes.ProductionSwiggyInstamartClient", return_value=fake):
        headers = _guest_with_items(client, "Milk")
        res = client.post("/grocery-list/checkout", json={"address_id": "a1"}, headers=headers)
        assert res.status_code == 400
        assert "1049" in res.json()["detail"]
        assert fake.checkout_calls == 0


def test_live_partial_multistore_order_does_not_restock():
    _live_env()
    fake = FakeInstamart(
        cart_response={"cartTotalAmount": "300"},
        checkout_response={"orders": [{"orderId": "o1", "status": "CONFIRMED"}, {"error": "store closed"}],
                           "orderCount": 2, "successCount": 1, "failureCount": 1, "allSucceeded": False},
    )
    with TestClient(app) as client, \
            patch("backend.grocery.routes._match_catalog_product_live", side_effect=_catalog({"Milk": 150, "Eggs": 150})), \
            patch("backend.grocery.routes.ProductionSwiggyInstamartClient", return_value=fake):
        headers = _guest_with_items(client, "Milk", "Eggs")
        res = client.post("/grocery-list/checkout", json={"address_id": "a1"}, headers=headers)
        assert res.status_code == 200
        body = res.json()
        assert body["partial"] is True
        assert body["restocked_to_full"] == []
        items = client.get("/grocery-list", headers=headers).json()["items"]
        assert not any(i["is_purchased"] for i in items)


def test_fractional_quantities_match_between_preview_and_cart():
    _live_env()
    fake = FakeInstamart(cart_response={"cartTotalAmount": "450"})
    with TestClient(app) as client, \
            patch("backend.grocery.routes._match_catalog_product_live", side_effect=_catalog({"Rice": 150})), \
            patch("backend.grocery.routes.ProductionSwiggyInstamartClient", return_value=fake):
        token = client.post("/auth/guest").json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}
        client.post("/grocery-list/items", json={"item_name": "Rice", "quantity": 2.5}, headers=headers)
        preview = client.post("/grocery-list/cart-preview", params={"address_id": "a1"}, headers=headers).json()
        assert preview["total_estimated_cost_rupees"] == 450  # 3 units
        client.post("/grocery-list/checkout", json={"address_id": "a1"}, headers=headers)
        assert fake.update_calls[0] == [{"spinId": "spin_Rice", "quantity": 3}]
