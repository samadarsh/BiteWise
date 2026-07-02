import requests
import json
from typing import Any, Dict, List, Optional
from agent.observability import log_info, log_error
from config.settings import get_settings

class SwiggyMCPError(Exception):
    """Base exception for Swiggy MCP client errors."""
    def __init__(self, message: str, error_code: Optional[int] = None, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.status_code = status_code


class SwiggyAuthError(SwiggyMCPError):
    """Raised when the session is unauthenticated or the OAuth token has expired (401)."""
    pass


class SwiggyFoodMCPClient:
    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None) -> None:
        settings = get_settings()
        self.base_url = base_url or settings.swiggy_mcp_base_url
        self.token = token or settings.swiggy_token

    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Generic method to call a Swiggy MCP tool using standard JSON-RPC 2.0 tools/call."""
        if not self.token:
            raise SwiggyAuthError("Authentication token (SWIGGY_TOKEN) is not configured.")

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            },
            "id": 1
        }

        # Log arguments without printing sensitive authorization token
        log_info(f"Initiating MCP JSON-RPC call to: {tool_name}", extra={"tool": tool_name, "arguments": arguments})

        try:
            response = requests.post(self.base_url, json=payload, headers=headers, timeout=15)

            # Detect 401 Unauthorized directly
            if response.status_code == 401:
                log_error("OAuth token has expired or is invalid (HTTP 401).", error_category="unauthenticated")
                raise SwiggyAuthError("Your Swiggy login session has expired. Please re-authenticate.", status_code=401)

            response.raise_for_status()

            response_json = response.json()

            # Handle JSON-RPC 2.0 error block
            if "error" in response_json:
                rpc_err = response_json["error"]
                err_code = rpc_err.get("code")
                err_msg = rpc_err.get("message", "Unknown JSON-RPC error")

                # Check for standard MCP session authentication error codes (e.g. -32001 or unauthenticated msg)
                if err_code in [-32001, -32002] or "unauthorized" in err_msg.lower() or "auth" in err_msg.lower():
                    raise SwiggyAuthError(f"Authentication failed: {err_msg}", error_code=err_code)

                raise SwiggyMCPError(f"Swiggy MCP error: {err_msg}", error_code=err_code)

            result = response_json.get("result", {})
            content_list = result.get("content", [])
            if not content_list:
                raise SwiggyMCPError("MCP response returned empty content.")

            text_content = content_list[0].get("text", "")
            if not text_content:
                raise SwiggyMCPError("MCP response returned an empty text block.")

            # Parse Swiggy standard envelope from the text block
            try:
                parsed_res = json.loads(text_content)
                return parsed_res
            except json.JSONDecodeError:
                # If response text is not JSON (raw text block fallback)
                return {
                    "success": True,
                    "data": {"text": text_content},
                    "message": "Raw text fallback parsed"
                }

        except requests.exceptions.RequestException as e:
            # Check for sub-exception containing status code
            status = getattr(e.response, "status_code", None) if hasattr(e, "response") else None
            if status == 401:
                raise SwiggyAuthError("Your Swiggy login session has expired. Please re-authenticate.", status_code=401) from e
            raise SwiggyMCPError(f"HTTP request to Swiggy MCP failed: {str(e)}", status_code=status) from e

    def _unpack_and_normalize(self, envelope: Dict[str, Any]) -> Any:
        """Unpacks data or raises a clean client error from Swiggy's response envelope."""
        success = envelope.get("success", False)
        data = envelope.get("data")
        msg = envelope.get("message")

        if success:
            return data

        # Parse error message from Swiggy error block or fallback message
        err = envelope.get("error", {})
        err_msg = err.get("message") or msg or "Unknown error occurred"

        # Check if error message indicates authentication failure
        if "auth" in err_msg.lower() or "expire" in err_msg.lower() or "token" in err_msg.lower():
            raise SwiggyAuthError(f"Unauthenticated: {err_msg}")

        raise SwiggyMCPError(err_msg)

    # Standard aligned Food tools:
    def get_addresses(self) -> List[Dict[str, Any]]:
        res = self.call_tool("get_addresses", {})
        return self._unpack_and_normalize(res)

    def search_restaurants(self, addressId: str, query: str, offset: Optional[int] = None) -> List[Dict[str, Any]]:
        args = {"addressId": addressId, "query": query}
        if offset is not None:
            args["offset"] = offset
        res = self.call_tool("search_restaurants", args)
        return self._unpack_and_normalize(res)

    def search_menu(self, addressId: str, query: str, restaurantIdOfAddedItem: Optional[str] = None, vegFilter: Optional[int] = None, offset: Optional[int] = None) -> List[Dict[str, Any]]:
        args = {"addressId": addressId, "query": query}
        if restaurantIdOfAddedItem is not None:
            args["restaurantIdOfAddedItem"] = restaurantIdOfAddedItem
        if vegFilter is not None:
            args["vegFilter"] = vegFilter
        if offset is not None:
            args["offset"] = offset
        res = self.call_tool("search_menu", args)
        return self._unpack_and_normalize(res)

    def get_restaurant_menu(self, addressId: str, restaurantId: str, page: Optional[int] = None, pageSize: Optional[int] = None) -> List[Dict[str, Any]]:
        args = {"addressId": addressId, "restaurantId": restaurantId}
        if page is not None:
            args["page"] = page
        if pageSize is not None:
            args["pageSize"] = pageSize
        res = self.call_tool("get_restaurant_menu", args)
        return self._unpack_and_normalize(res)

    def update_food_cart(self, restaurantId: str, cartItems: List[Dict[str, Any]], addressId: str, restaurantName: Optional[str] = None) -> Dict[str, Any]:
        args = {
            "restaurantId": restaurantId,
            "cartItems": cartItems,
            "addressId": addressId
        }
        if restaurantName is not None:
            args["restaurantName"] = restaurantName
        res = self.call_tool("update_food_cart", args)
        return self._unpack_and_normalize(res)

    def get_food_cart(self, addressId: str, restaurantName: Optional[str] = None) -> Dict[str, Any]:
        args = {"addressId": addressId}
        if restaurantName is not None:
            args["restaurantName"] = restaurantName
        res = self.call_tool("get_food_cart", args)
        return self._unpack_and_normalize(res)

    def get_food_orders(self, addressId: str, orderCount: Optional[int] = None) -> List[Dict[str, Any]]:
        args = {"addressId": addressId}
        if orderCount is not None:
            args["orderCount"] = orderCount
        res = self.call_tool("get_food_orders", args)
        return self._unpack_and_normalize(res)

    def fetch_food_coupons(self, restaurantId: str, addressId: str, couponCode: Optional[str] = None) -> List[Dict[str, Any]]:
        args = {"restaurantId": restaurantId, "addressId": addressId}
        if couponCode is not None:
            args["couponCode"] = couponCode
        res = self.call_tool("fetch_food_coupons", args)
        return self._unpack_and_normalize(res)

    def apply_food_coupon(self, couponCode: str, addressId: str, cartId: Optional[str] = None) -> Dict[str, Any]:
        args = {"couponCode": couponCode, "addressId": addressId}
        if cartId is not None:
            args["cartId"] = cartId
        res = self.call_tool("apply_food_coupon", args)
        return self._unpack_and_normalize(res)

    def place_food_order(self, addressId: str, paymentMethod: Optional[str] = "COD") -> Dict[str, Any]:
        # Lock safety check: staging placement requires both explicit staging mode
        # and an explicit allow flag. Never let either flag alone unlock ordering.
        settings = get_settings()
        if settings.swiggy_env != "staging" or not settings.allow_place_order:
            raise SwiggyMCPError(
                "Safety Lock: place_food_order is disabled unless SWIGGY_ENV=staging "
                "and ALLOW_PLACE_ORDER=true."
            )

        args = {"addressId": addressId, "paymentMethod": paymentMethod}
        res = self.call_tool("place_food_order", args)
        return self._unpack_and_normalize(res)

    def track_food_order(self, orderId: str) -> Dict[str, Any]:
        args = {"orderId": orderId}
        res = self.call_tool("track_food_order", args)
        return self._unpack_and_normalize(res)
