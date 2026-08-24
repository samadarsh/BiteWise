"""
Regression coverage for the mock/live catalog separation in
backend/grocery/routes.py — previously _match_catalog_product always used
the hardcoded mock Instamart catalog regardless of USE_MOCK_MCP, so a real
checkout would send fabricated mock spinIds to Swiggy's real cart/checkout
endpoints. Real mode must search Swiggy's actual catalog instead.
"""
import os
from unittest.mock import patch
from backend.grocery.routes import _match_catalog_product


def _set_mock(value: str):
    original = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = value
    return original


def _restore(original):
    if original is not None:
        os.environ["USE_MOCK_MCP"] = original
    else:
        os.environ.pop("USE_MOCK_MCP", None)


def test_mock_mode_uses_local_catalog():
    original = _set_mock("true")
    try:
        result = _match_catalog_product("milk", "user_1", None)
        assert result is not None
        assert "spinId" in result
    finally:
        _restore(original)


def test_real_mode_without_address_returns_none_not_mock_data():
    """No address_id yet (e.g. preview requested before one is selected) must
    degrade to the generic estimate path, never to fabricated mock data."""
    original = _set_mock("false")
    try:
        result = _match_catalog_product("milk", "user_1", None)
        assert result is None
    finally:
        _restore(original)


@patch("backend.grocery.routes.ProductionSwiggyInstamartClient")
def test_real_mode_with_address_searches_live_catalog(mock_client_cls):
    original = _set_mock("false")
    mock_instance = mock_client_cls.return_value
    mock_instance.search_products.return_value = [
        {
            "displayName": "Aavin Toned Milk",
            "variations": [
                {"spinId": "F659TW5OSX", "isInStockAndAvailable": True, "price": {"offerPrice": 20, "mrp": 22}}
            ],
        }
    ]
    try:
        result = _match_catalog_product("milk", "user_1", "addr_123")
        assert result == {"name": "Aavin Toned Milk", "price": 20.0, "spinId": "F659TW5OSX"}
        mock_instance.search_products.assert_called_once_with(addressId="addr_123", query="milk")
    finally:
        _restore(original)


@patch("backend.grocery.routes.ProductionSwiggyInstamartClient")
def test_real_mode_search_failure_returns_none_not_crash(mock_client_cls):
    original = _set_mock("false")
    mock_client_cls.return_value.search_products.side_effect = ConnectionError("Swiggy unreachable")
    try:
        result = _match_catalog_product("milk", "user_1", "addr_123")
        assert result is None
    finally:
        _restore(original)
