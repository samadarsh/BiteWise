import requests
import json
import time
import uuid
from typing import Any, Dict, List, Optional
from agent.observability import log_info, log_error, log_warn, metrics_tracker
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


class _SwiggyMCPTransport:
    """
    Shared JSON-RPC 2.0 tools/call transport for Swiggy MCP servers (Food, Instamart, ...).
    Each product line's tools live behind their own base_url but speak the identical
    protocol, so this holds everything that isn't tool-name-specific.
    """
    def __init__(self, base_url: str, token: Optional[str] = None) -> None:
        self.base_url = base_url
        self.token = token or get_settings().swiggy_token

    def _summarize_arguments(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Log only non-sensitive argument shape, not raw IDs, queries, or coupon codes."""
        summary: Dict[str, Any] = {
            "arg_keys": sorted(arguments.keys()),
        }
        if "cartItems" in arguments and isinstance(arguments["cartItems"], list):
            summary["cart_items_count"] = len(arguments["cartItems"])
        if "items" in arguments and isinstance(arguments["items"], list):
            summary["items_count"] = len(arguments["items"])
        if "query" in arguments:
            summary["query_length"] = len(str(arguments.get("query") or ""))
        if "couponCode" in arguments:
            summary["has_coupon_code"] = bool(arguments.get("couponCode"))
        if "addressId" in arguments:
            summary["address_scope"] = "provided"
        if "restaurantId" in arguments:
            summary["restaurant_scope"] = "provided"
        return summary

    def _extract_swiggy_meta(self, response_json: Dict[str, Any], envelope: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Extract Swiggy MCP metadata from JSON-RPC result or parsed envelope."""
        meta_sources: List[Dict[str, Any]] = []
        result = response_json.get("result")
        if isinstance(result, dict):
            result_meta = result.get("_meta")
            if isinstance(result_meta, dict):
                meta_sources.append(result_meta)
        if isinstance(envelope, dict):
            envelope_meta = envelope.get("_meta")
            if isinstance(envelope_meta, dict):
                meta_sources.append(envelope_meta)

        combined: Dict[str, Any] = {}
        for meta in meta_sources:
            swiggy_meta = meta.get("swiggy") if isinstance(meta.get("swiggy"), dict) else {}
            combined.update(swiggy_meta)
            for key in ("sessionId", "session_id", "deprecation"):
                if key in meta and key not in combined:
                    combined[key] = meta[key]
        return combined

    def _log_deprecation_if_present(self, tool_name: str, request_id: str, swiggy_meta: Dict[str, Any]) -> None:
        deprecation = swiggy_meta.get("deprecation")
        if deprecation:
            log_warn(
                "Swiggy MCP response included deprecation metadata.",
                extra={
                    "event": "mcp_deprecation",
                    "tool": tool_name,
                    "mcp_request_id": request_id,
                    "deprecation": deprecation,
                },
            )

    def _record_tool_completion(
        self,
        tool_name: str,
        request_id: str,
        started_at: float,
        success: bool,
        status_code: Optional[int] = None,
        error_category: Optional[str] = None,
        swiggy_meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        duration_sec = time.perf_counter() - started_at
        metrics_tracker.record_latency(f"mcp_tool.{tool_name}", duration_sec)
        metrics_tracker.record_tool_call(success=success)

        swiggy_meta = swiggy_meta or {}
        session_id = swiggy_meta.get("sessionId") or swiggy_meta.get("session_id")
        extra = {
            "event": "mcp_tool_call",
            "tool": tool_name,
            "mcp_request_id": request_id,
            "duration_ms": round(duration_sec * 1000, 2),
            "status": "ok" if success else "failed",
        }
        if status_code is not None:
            extra["http_status"] = status_code
        if session_id:
            extra["swiggy_session_id"] = session_id

        if success:
            log_info("MCP tool call completed.", extra=extra)
        else:
            log_error("MCP tool call failed.", error_category=error_category or "mcp_error", extra=extra)

    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Generic method to call a Swiggy MCP tool using standard JSON-RPC 2.0 tools/call."""
        if not self.token:
            raise SwiggyAuthError("Authentication token (SWIGGY_TOKEN) is not configured.")

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

        request_id = f"mcp_{uuid.uuid4().hex}"
        started_at = time.perf_counter()

        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            },
            "id": request_id
        }

        log_info(
            "MCP tool call started.",
            extra={
                "event": "mcp_tool_call_started",
                "tool": tool_name,
                "mcp_request_id": request_id,
                "argument_summary": self._summarize_arguments(arguments),
            },
        )

        try:
            response = requests.post(self.base_url, json=payload, headers=headers, timeout=15)

            # Detect 401 Unauthorized directly
            if response.status_code == 401:
                self._record_tool_completion(
                    tool_name,
                    request_id,
                    started_at,
                    success=False,
                    status_code=response.status_code,
                    error_category="unauthenticated",
                )
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
                    self._record_tool_completion(
                        tool_name,
                        request_id,
                        started_at,
                        success=False,
                        status_code=response.status_code,
                        error_category="unauthenticated",
                    )
                    raise SwiggyAuthError(f"Authentication failed: {err_msg}", error_code=err_code)

                self._record_tool_completion(
                    tool_name,
                    request_id,
                    started_at,
                    success=False,
                    status_code=response.status_code,
                    error_category="domain_failure",
                )
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
                swiggy_meta = self._extract_swiggy_meta(response_json, parsed_res)
                self._log_deprecation_if_present(tool_name, request_id, swiggy_meta)
                self._record_tool_completion(
                    tool_name,
                    request_id,
                    started_at,
                    success=True,
                    status_code=response.status_code,
                    swiggy_meta=swiggy_meta,
                )
                return parsed_res
            except json.JSONDecodeError:
                # If response text is not JSON (raw text block fallback)
                swiggy_meta = self._extract_swiggy_meta(response_json)
                self._log_deprecation_if_present(tool_name, request_id, swiggy_meta)
                self._record_tool_completion(
                    tool_name,
                    request_id,
                    started_at,
                    success=True,
                    status_code=response.status_code,
                    swiggy_meta=swiggy_meta,
                )
                return {
                    "success": True,
                    "data": {"text": text_content},
                    "message": "Raw text fallback parsed"
                }

        except requests.exceptions.RequestException as e:
            # Check for sub-exception containing status code
            status = getattr(e.response, "status_code", None) if hasattr(e, "response") else None
            error_category = "upstream_error"
            if status == 401:
                error_category = "unauthenticated"
                self._record_tool_completion(
                    tool_name,
                    request_id,
                    started_at,
                    success=False,
                    status_code=status,
                    error_category=error_category,
                )
                raise SwiggyAuthError("Your Swiggy login session has expired. Please re-authenticate.", status_code=401) from e
            if status == 429:
                error_category = "rate_limited"
            elif status and 400 <= status < 500:
                error_category = "domain_failure"
            elif "timeout" in str(e).lower():
                error_category = "upstream_timeout"
            self._record_tool_completion(
                tool_name,
                request_id,
                started_at,
                success=False,
                status_code=status,
                error_category=error_category,
            )
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


class SwiggyFoodMCPClient(_SwiggyMCPTransport):
    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None) -> None:
        settings = get_settings()
        super().__init__(base_url=base_url or settings.swiggy_mcp_base_url, token=token)

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

    def flush_food_cart(self) -> Dict[str, Any]:
        """Clears the staging cart. Swiggy flush_food_cart takes no tool arguments."""
        res = self.call_tool("flush_food_cart", {})
        return self._unpack_and_normalize(res)


class SwiggyInstamartMCPClient(_SwiggyMCPTransport):
    """
    Real Swiggy Instamart MCP client. Tool names/params/safety notes verified against
    https://mcp.swiggy.com/builders/docs/reference/instamart/*.md — see CLAUDE.md.
    """
    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None) -> None:
        settings = get_settings()
        super().__init__(base_url=base_url or settings.swiggy_instamart_mcp_base_url, token=token)

    def search_products(self, addressId: str, query: str, offset: Optional[int] = None) -> List[Dict[str, Any]]:
        args = {"addressId": addressId, "query": query}
        if offset is not None:
            args["offset"] = offset
        res = self.call_tool("search_products", args)
        return self._unpack_and_normalize(res)

    def update_cart(self, selectedAddressId: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Replaces the entire Instamart cart with the given [{spinId, quantity}, ...] items."""
        args = {"selectedAddressId": selectedAddressId, "items": items}
        res = self.call_tool("update_cart", args)
        return self._unpack_and_normalize(res)

    def get_cart(self) -> Dict[str, Any]:
        res = self.call_tool("get_cart", {})
        return self._unpack_and_normalize(res)

    def checkout(self, addressId: str, paymentMethod: Optional[str] = "COD") -> Dict[str, Any]:
        # Same dual-flag safety lock as Food's place_food_order — staging mode alone,
        # or the allow flag alone, must never be sufficient to place a real order.
        settings = get_settings()
        if settings.swiggy_env != "staging" or not settings.allow_place_order:
            raise SwiggyMCPError(
                "Safety Lock: checkout is disabled unless SWIGGY_ENV=staging "
                "and ALLOW_PLACE_ORDER=true."
            )

        args = {"addressId": addressId, "paymentMethod": paymentMethod}
        res = self.call_tool("checkout", args)
        return self._unpack_and_normalize(res)

    def get_orders(self, count: Optional[int] = None, orderType: Optional[str] = "INSTAMART", activeOnly: Optional[bool] = None) -> Dict[str, Any]:
        args: Dict[str, Any] = {}
        if count is not None:
            args["count"] = count
        if orderType is not None:
            args["orderType"] = orderType
        if activeOnly is not None:
            args["activeOnly"] = activeOnly
        res = self.call_tool("get_orders", args)
        return self._unpack_and_normalize(res)

    def track_order(self, orderId: str, lat: float, lng: float) -> Dict[str, Any]:
        args = {"orderId": orderId, "lat": lat, "lng": lng}
        res = self.call_tool("track_order", args)
        return self._unpack_and_normalize(res)
