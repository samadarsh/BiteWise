import os

from fastapi.testclient import TestClient

from backend.main import app
from backend.orders.routes import _tracking_view


def _guest(client):
    token = client.post("/auth/guest").json()["session_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})


def test_track_endpoint_reports_real_status_for_placed_order():
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as client:
        _guest(client)
        addr = client.get("/me/addresses").json()[0]["id"]
        sid = client.post("/orders/session/start").json()["session_id"]
        client.post(f"/orders/session/{sid}/select-address", params={"address_id": addr})
        rec = client.post("/recommendations/search", json={"session_id": sid, "query": "high protein lunch"}).json()["results"]["recommendations"][0]
        assert client.get(f"/orders/session/{sid}/track").status_code == 400  # not placed yet
        client.post(f"/orders/session/{sid}/select-item", params={"restaurant_id": rec["restaurant_id"], "item_id": rec["item_id"]})
        client.post(f"/orders/session/{sid}/cart", params={"allow_restaurant_switch": "true"})
        client.get(f"/orders/session/{sid}/cart")
        client.post(f"/orders/session/{sid}/confirm")
        placed = client.post(f"/orders/session/{sid}/place", params={"user_confirmed": "true"})
        assert placed.status_code == 200, placed.text

        res = client.get(f"/orders/session/{sid}/track").json()
        assert res["tracking_available"] and res["active"]
        assert res["order_id"] == placed.json()["order_id"]
        assert res["order_status"] == "confirmed"


def test_tracking_view_reads_documented_live_shape():
    live = {"orders": [
        {"orderId": "other", "title": "Someone else's", "orderStatus": "X"},
        {"orderId": "o1", "title": "Food is being prepared", "subtitle": "Biryani House", "etaText": "25 mins",
         "orderStatus": "PREPARING", "progressPercentage": "40"},
    ]}
    view = _tracking_view(live, "o1")
    assert view["active"] and view["title"] == "Food is being prepared"
    assert view["eta_text"] == "25 mins" and view["progress_percentage"] == 40.0
    gone = _tracking_view({"orders": [], "statusMessage": "No active orders"}, "o1")
    assert gone["active"] is False and gone["title"] == "No active orders"
