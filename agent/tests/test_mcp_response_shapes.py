"""
Regression coverage for the real-Swiggy-response parsing gaps found the first
time BiteWise ever exercised a live (non-mock) MCP tool call:

  1. structuredContent (MCP spec, server/tools) is where the real payload
     lives; content[0].text is a human/LLM-facing rendering that Swiggy's
     real server fills with prose, not JSON — the mock client's fixtures put
     JSON there instead, which is why this was never caught before.
  2. Tool-level failures are signaled via result.isError: true (MCP spec),
     not a "success" field anywhere — previously unhandled, so a real
     failure silently reported back as success=True with the error text
     sitting where the data was expected.
  3. get_addresses' real structuredContent shape is
     {"addresses": [...], "total": N, "pagination": {...}}, not a bare list.
"""
import json
from unittest.mock import patch
from mcp.mcp_client import SwiggyFoodMCPClient, SwiggyInstamartMCPClient, SwiggyMCPError, SwiggyAuthError


class FakeResponse:
    def __init__(self, body, status_code=200):
        self._body = body
        self.status_code = status_code

    def raise_for_status(self):
        return None

    def json(self):
        return self._body


def _client(fake_body):
    def fake_post(url, json=None, headers=None, timeout=None):
        return FakeResponse(fake_body)
    return fake_post


def test_call_tool_prefers_structured_content_over_prose_text():
    """Real Swiggy shape: content[0].text is prose, structuredContent has the
    actual data. The prose must never be what callers receive as data."""
    body = {
        "jsonrpc": "2.0",
        "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Found 2 saved addresses (page 1 of 1):\n1. [Home] ..."}],
            "structuredContent": {
                "addresses": [{"id": "a1", "addressLine": "123 Test St", "addressTag": "Home"}],
                "total": 1,
            },
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        res = client.call_tool("get_addresses", {})

    assert res["success"] is True
    assert res["data"]["addresses"][0]["addressLine"] == "123 Test St"


def test_get_addresses_unwraps_real_shape():
    body = {
        "jsonrpc": "2.0",
        "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Found 1 saved address."}],
            "structuredContent": {
                "addresses": [{"id": "a1", "addressLine": "123 Test St", "addressTag": "Home"}],
                "total": 1,
                "pagination": {"page": 1, "hasMore": False},
            },
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        addresses = client.get_addresses()

    assert isinstance(addresses, list)
    assert len(addresses) == 1
    assert addresses[0]["id"] == "a1"


def test_call_tool_isError_raises_domain_failure_not_silent_success():
    body = {
        "jsonrpc": "2.0",
        "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Failed to fetch restaurants: upstream timeout"}],
            "isError": True,
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        try:
            client.call_tool("search_restaurants", {"addressId": "a1", "query": "pizza"})
            assert False, "expected SwiggyMCPError"
        except SwiggyAuthError:
            assert False, "should not be classified as an auth error"
        except SwiggyMCPError as e:
            assert "upstream timeout" in e.message


def test_call_tool_isError_with_auth_wording_raises_auth_error():
    body = {
        "jsonrpc": "2.0",
        "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Your access token has expired"}],
            "isError": True,
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        try:
            client.call_tool("get_addresses", {})
            assert False, "expected SwiggyAuthError"
        except SwiggyAuthError as e:
            assert "expired" in e.message.lower()


def test_call_tool_still_falls_back_to_json_in_text_when_no_structured_content():
    """Mock-mode / any tool without structuredContent keeps working exactly
    as before this fix — this is the existing, already-covered contract."""
    envelope = {"success": True, "data": {"restaurants": []}, "message": None}
    body = {
        "jsonrpc": "2.0",
        "id": "1",
        "result": {
            "content": [{"type": "text", "text": json.dumps(envelope)}],
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        res = client.call_tool("search_restaurants", {"addressId": "a1", "query": "pizza"})

    assert res == envelope


def test_search_menu_unwraps_items_key():
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Found 1 menu item."}],
            "structuredContent": {"items": [{"name": "Chicken Wings", "price": 269, "menu_item_id": "m1"}]},
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        items = client.search_menu(addressId="a1", query="chicken")
    assert isinstance(items, list) and len(items) == 1
    assert items[0]["menu_item_id"] == "m1"


def test_search_restaurants_unwraps_restaurants_key():
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Found 1 restaurant."}],
            "structuredContent": {"restaurants": [{"id": "r1", "name": "Test Place"}], "total": 1},
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        restaurants = client.search_restaurants(addressId="a1", query="pizza")
    assert restaurants == [{"id": "r1", "name": "Test Place"}]


def test_get_restaurant_menu_flattens_categories():
    """Real shape nests items two levels deep under categories[].items[] —
    not a flat list, unlike every other Food list tool."""
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Menu loaded."}],
            "structuredContent": {
                "restaurant": {"id": "r1", "name": "Test Place"},
                "categories": [
                    {"title": "Mains", "items": [{"id": "i1", "name": "Burger"}]},
                    {"title": "Sides", "items": [{"id": "i2", "name": "Fries"}]},
                ],
            },
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        items = client.get_restaurant_menu(addressId="a1", restaurantId="r1")
    assert [i["id"] for i in items] == ["i1", "i2"]


def test_get_food_orders_unwraps_orders_key():
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {
            "content": [{"type": "text", "text": "1 order."}],
            "structuredContent": {"orders": [{"orderId": "o1", "orderStatus": "Delivered"}]},
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        orders = client.get_food_orders(addressId="a1")
    assert orders == [{"orderId": "o1", "orderStatus": "Delivered"}]


def test_fetch_food_coupons_degrades_safely_when_no_structured_content():
    """Real behavior when a restaurant has zero coupons: no structuredContent
    at all, just prose in content[0].text. Must return [], not crash."""
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {"content": [{"type": "text", "text": "Found 0 coupons (0 applicable)."}]},
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        coupons = client.fetch_food_coupons(restaurantId="r1", addressId="a1")
    assert coupons == []


def test_cart_family_successful_false_raises_not_silent_success():
    """Cart tools (get_food_cart, update_food_cart) use a completely
    different envelope — "successful" instead of "success", with the failure
    reason in statusMessage/titleMessage. Confirmed live: update_food_cart
    with a stale item ID returns exactly this shape."""
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Apologies! one or more items in your cart are no longer available"}],
            "structuredContent": {
                "statusCode": 1,
                "successful": False,
                "data": None,
                "titleMessage": "Apologies! one or more items in your cart are no longer available",
                "errorCodes": ["INVALID_ITEM_IDS_IN_REQUEST"],
            },
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        try:
            client.update_food_cart(restaurantId="r1", addressId="a1", cartItems=[{"id": "stale"}])
            assert False, "expected SwiggyMCPError"
        except SwiggyMCPError as e:
            assert "no longer available" in e.message


def test_cart_family_successful_true_with_null_data_returns_empty_dict():
    """An empty cart is a real, successful response with data: null — must
    come back as {} (the wrapper's typed contract), not None."""
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Cart status."}],
            "structuredContent": {"statusCode": 0, "successful": True, "data": None},
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        cart = client.get_food_cart(addressId="a1")
    assert cart == {}


def test_instamart_search_products_unwraps_products_key():
    """Unlike Food, Instamart puts the full documented {success, data,
    message} envelope as JSON text in content[0].text (no structuredContent
    at all) — confirmed live. data.products still needs the same named-key
    unwrap as every other list tool."""
    envelope = {
        "success": True,
        "data": {"products": [{"displayName": "Milk", "variations": [{"spinId": "s1"}]}]},
        "message": None,
    }
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {"content": [{"type": "text", "text": json.dumps(envelope)}]},
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyInstamartMCPClient(base_url="https://mcp.test/im", token="tok")
        products = client.search_products(addressId="a1", query="milk")
    assert products == [{"displayName": "Milk", "variations": [{"spinId": "s1"}]}]


def test_report_error_returns_mailto_link_and_summary():
    """Confirmed live: report_error's structuredContent has no "success" key
    of its own — it's the bare {reportLink, supportEmail, summary} payload,
    same "implicit success" convention as search_menu/search_restaurants."""
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Report generated."}],
            "structuredContent": {
                "reportLink": "mailto:mcp-support@swiggy.in?subject=...",
                "supportEmail": "mcp-support@swiggy.in",
                "summary": "Domain: Swiggy Food\nTool: update_food_cart\n...",
            },
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        result = client.report_error(
            tool="update_food_cart",
            error_message="INVALID_ITEM_IDS_IN_REQUEST",
            tool_context={"restaurantId": "r1", "addressId": "a1"},
        )
    assert result["supportEmail"] == "mcp-support@swiggy.in"
    assert result["reportLink"].startswith("mailto:")


def test_instamart_update_cart_and_get_cart_reflect_real_populated_shape():
    """Confirmed live: Instamart's update_cart/get_cart work correctly on the
    first try (unlike Food's cart tools) — items are real objects with
    itemName/spinId/quantity, cartTotalAmount is a currency-formatted string
    ("₹126") that must never be used in arithmetic downstream."""
    envelope = {
        "success": True,
        "data": {
            "cartTotalAmount": "₹126",
            "items": [{"spinId": "F659TW5OSX", "itemName": "Aavin Pasteurised Toned MilK 500 ml", "quantity": 1}],
            "billBreakdown": {"lineItems": []},
        },
        "message": None,
    }
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {"content": [{"type": "text", "text": json.dumps(envelope)}]},
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyInstamartMCPClient(base_url="https://mcp.test/im", token="tok")
        cart = client.get_cart()
    assert cart["cartTotalAmount"] == "₹126"
    assert cart["items"][0]["itemName"] == "Aavin Pasteurised Toned MilK 500 ml"


def test_instamart_clear_cart_handles_empty_structured_content():
    """Confirmed live: clear_cart's real structuredContent is an empty {} (no
    data to report) — must return {} cleanly, not crash or return None."""
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Cart cleared successfully. All items have been removed from the cart."}],
            "structuredContent": {},
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyInstamartMCPClient(base_url="https://mcp.test/im", token="tok")
        result = client.clear_cart()
    assert result == {}


def test_production_client_report_error_skips_in_mock_mode():
    """No genuine Swiggy-side error to report when running against the mock
    client — must no-op instead of crashing on the mock's missing method."""
    import os
    from backend.mcp.swiggy_client import ProductionSwiggyClient

    original = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = "true"
    try:
        client = ProductionSwiggyClient(user_id="test_user")
        result = client.report_error(tool="update_food_cart", error_message="some error")
        assert result["skipped"] is True
    finally:
        if original is not None:
            os.environ["USE_MOCK_MCP"] = original
        else:
            os.environ.pop("USE_MOCK_MCP", None)


def test_get_restaurant_menu_with_metadata_keeps_restaurant_object():
    """The plain get_restaurant_menu() flattens and discards the restaurant
    object entirely — this variant keeps it, since it's the only place
    isOpen/avgRating/deliveryTime are available for search_menu-sourced
    candidates."""
    body = {
        "jsonrpc": "2.0", "id": "1",
        "result": {
            "content": [{"type": "text", "text": "Menu loaded."}],
            "structuredContent": {
                "restaurant": {"id": "r1", "name": "Test Place", "isOpen": False, "avgRating": 4.2, "deliveryTime": 25},
                "categories": [{"title": "Mains", "items": [{"id": "i1", "name": "Burger"}]}],
            },
        },
    }
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        result = client.get_restaurant_menu_with_metadata(addressId="a1", restaurantId="r1")
    assert result["restaurant"]["isOpen"] is False
    assert result["restaurant"]["avgRating"] == 4.2
    assert [i["id"] for i in result["items"]] == ["i1"]


def test_domain_errors_mentioning_expiry_are_not_auth_failures():
    """Regression: "auth"/"token"/"expire" anywhere in a message used to be
    treated as a dead Swiggy login — so "This coupon has expired" deleted the
    user's stored Swiggy token. Only documented auth signals count."""
    client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
    for message in ("This coupon has expired", "Offer for Swiggy One members (Author: promo)", "Invalid token in cart request"):
        try:
            client._unpack_and_normalize({"success": False, "error": {"message": message}})
            assert False, "expected SwiggyMCPError"
        except SwiggyAuthError:
            assert False, f"{message!r} must not be classified as an auth failure"
        except SwiggyMCPError:
            pass


def test_jsonrpc_32001_is_auth_failure():
    body = {"jsonrpc": "2.0", "id": "1", "error": {"code": -32001, "message": "Cannot resolve session"}}
    with patch("requests.post", side_effect=_client(body)):
        client = SwiggyFoodMCPClient(base_url="https://mcp.test/food", token="tok")
        try:
            client.call_tool("get_addresses", {})
            assert False, "expected SwiggyAuthError"
        except SwiggyAuthError:
            pass


def test_live_food_cart_shape_is_normalized():
    """Swiggy's documented cart puts the payable total at data.pricing.to_pay
    and the restaurant at data.restaurant — callers used to read bill.total /
    total / restaurantId and got 0 / None in live mode."""
    from mcp.mcp_client import normalize_food_cart, cart_total
    live = {
        "data": {
            "cart_id": "c1",
            "restaurant": {"id": "r9", "name": "Real Place"},
            "items": [{"menu_item_id": "m1", "name": "Bowl", "quantity": 1, "total": 1180}],
            "pricing": {"item_total": 1100, "delivery_charge": 40, "taxes_and_charges": 60, "to_pay": 1200},
            "offers": {"coupon_applied": "SAVE50", "coupon_discount": 0},
        },
        "addressId": "a1",
        "availablePaymentMethods": ["Cash", "UPI"],
    }
    cart = normalize_food_cart(live)
    assert cart_total(cart) == 1200
    assert cart["restaurantId"] == "r9"
    assert cart["restaurantName"] == "Real Place"
    assert cart["cartItems"][0]["menu_item_id"] == "m1"
    assert cart["availablePaymentMethods"] == ["Cash", "UPI"]
    # Coupon code present but zero discount = not applied (per docs).
    assert cart["applied_coupon"] is None
    # Unknown total with items must stay unknown, never become 0.
    live["data"]["pricing"] = {}
    assert cart_total(normalize_food_cart(live)) is None
