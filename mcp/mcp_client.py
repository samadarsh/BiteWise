import re
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


# Per /docs/reference/errors: auth failures are HTTP 401 (419 = session
# revoked) or JSON-RPC -32001. Message text is only a fallback, and only
# phrases that are unambiguously about the login session count — the old
# check treated ANY message containing "auth", "token" or "expire" (e.g.
# "This coupon has expired") as a dead login, which made BiteWise delete the
# user's Swiggy connection.
_AUTH_ERROR_CODES = {-32001}
_AUTH_HTTP_STATUSES = {401, 419}
_AUTH_MESSAGE_PATTERN = re.compile(
    r"unauthenticated|unauthori[sz]ed|re-?authenticate|not (?:logged|signed) in|"
    r"(?:access[ _]?token|auth(?:entication)?[ _]?token|login|session)\b[^.]{0,40}\b(?:expired|invalid|revoked)|"
    r"(?:expired|invalid|revoked)\b[^.]{0,20}\b(?:access[ _]?token|auth(?:entication)?[ _]?token|login|session)\b",
    re.IGNORECASE,
)


def is_auth_failure(message: Optional[str] = None, code: Any = None, http_status: Optional[int] = None) -> bool:
    if http_status in _AUTH_HTTP_STATUSES or code in _AUTH_ERROR_CODES or code in _AUTH_HTTP_STATUSES:
        return True
    return bool(message and _AUTH_MESSAGE_PATTERN.search(message))


def _to_number(value: Any) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(str(value).replace(",", "").replace("₹", "").strip())
    except (TypeError, ValueError):
        return None


def normalize_food_cart(payload: Any) -> Dict[str, Any]:
    """
    Maps Swiggy's documented Food cart payload (get_food_cart /
    update_food_cart reference docs: `data.restaurant`, `data.items`,
    `data.pricing.to_pay`, `data.offers`, plus top-level
    `availablePaymentMethods`) onto the flat keys the rest of BiteWise uses
    (restaurantId, restaurantName, cartItems, total, bill.total,
    applied_coupon, discount_amount) — the same keys the mock client emits.

    Every caller used to read `bill.total` / `total` / `restaurantId`
    directly, none of which exist on a real cart, so in live mode the cart
    total always read as 0 (silently defeating the Rs 1000 cap) and the
    restaurant-switch guard never fired.

    `total` is None when the payload has items but no readable price, so
    callers can fail closed instead of treating an unknown total as Rs 0.
    """
    if not isinstance(payload, dict):
        return {}

    inner = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if not any(k in inner for k in ("pricing", "items", "restaurant")) and isinstance(inner.get("data"), dict):
        inner = inner["data"]
    if not any(k in inner for k in ("pricing", "items", "restaurant")):
        return payload  # already flat (mock client) shape

    restaurant = inner.get("restaurant") if isinstance(inner.get("restaurant"), dict) else {}
    pricing = inner.get("pricing") if isinstance(inner.get("pricing"), dict) else {}
    offers = inner.get("offers") if isinstance(inner.get("offers"), dict) else {}
    items = [i for i in (inner.get("items") or []) if isinstance(i, dict)]

    total = _to_number(pricing.get("to_pay"))
    if total is None and not items:
        total = 0.0
    coupon_discount = _to_number(offers.get("coupon_discount")) or 0.0
    # Per the docs, a coupon counts as applied only with a code AND a
    # positive discount.
    applied_coupon = offers.get("coupon_applied") if coupon_discount > 0 else None

    normalized = dict(payload)
    normalized.update({
        "restaurantId": restaurant.get("id"),
        "restaurantName": restaurant.get("name"),
        "cartItems": [
            {
                "menu_item_id": i.get("menu_item_id"),
                "name": i.get("name"),
                "quantity": i.get("quantity"),
                "lineTotal": _to_number(i.get("total")),
                "in_stock": i.get("in_stock"),
            }
            for i in items
        ],
        "total": total,
        "bill": {
            "subtotal": _to_number(pricing.get("item_total")),
            "delivery": _to_number(pricing.get("delivery_charge")),
            "taxes": _to_number(pricing.get("taxes_and_charges")),
            "discount": coupon_discount,
            "total": total,
        },
        "applied_coupon": applied_coupon,
        "discount_amount": coupon_discount,
        "cartId": inner.get("cart_id"),
        "availablePaymentMethods": payload.get("availablePaymentMethods") or inner.get("availablePaymentMethods") or [],
    })
    return normalized


def cart_total(cart: Dict[str, Any]) -> Optional[float]:
    """Payable total of a (normalized or mock) Food cart, or None if unknown."""
    if not isinstance(cart, dict):
        return None
    bill = cart.get("bill") if isinstance(cart.get("bill"), dict) else {}
    for value in (bill.get("total"), cart.get("total")):
        number = _to_number(value)
        if number is not None:
            return number
    return None


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
            "Content-Type": "application/json",
            # Not shown in Swiggy's own curl examples (those assume an MCP SDK
            # adds it for you), but their changelog says they implement the
            # real MCP Streamable HTTP transport spec (modelcontextprotocol.io),
            # which requires this on every POST — a raw hand-rolled client like
            # this one has to set it explicitly or the server 406s.
            "Accept": "application/json, text/event-stream",
            # Optional per spec (servers must tolerate its absence for back-
            # compat), but sending it is what a real MCP SDK would do and
            # costs nothing — https://modelcontextprotocol.io/specification/2025-06-18
            "MCP-Protocol-Version": "2025-06-18"
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
            if response.status_code in _AUTH_HTTP_STATUSES:
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
                if is_auth_failure(err_msg, code=err_code):
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

            # MCP spec (server/tools): tool-level failures (API errors, bad
            # input, business-logic errors — as opposed to protocol errors,
            # already handled above) are signaled with result.isError: true,
            # not by a "success" field anywhere. Missing this meant a real
            # tool failure fell through to the raw-text-fallback branch below
            # and got reported back as success=True with the error prose
            # sitting where address/menu/etc. data was expected.
            if result.get("isError"):
                err_text = content_list[0].get("text", "Tool execution failed.") if content_list else "Tool execution failed."
                self._record_tool_completion(
                    tool_name, request_id, started_at, success=False,
                    status_code=response.status_code, error_category="domain_failure",
                )
                if is_auth_failure(err_text):
                    raise SwiggyAuthError(f"Authentication failed: {err_text}")
                raise SwiggyMCPError(f"Swiggy MCP error: {err_text}")

            # MCP spec (server/tools, "Structured Content"): structuredContent
            # is the server-produced, machine-readable result — content[]
            # is a human/LLM-facing rendering and is NOT guaranteed to be the
            # JSON-serialized payload (Swiggy's real responses put prose
            # there, not JSON — only the mock client's fixtures happen to put
            # JSON in content[0].text, which is why this was never exercised
            # before real credentials existed).
            structured = result.get("structuredContent")
            if isinstance(structured, dict):
                if "success" in structured:
                    parsed_res = structured
                elif "successful" in structured:
                    # Cart-family tools (get_food_cart, update_food_cart, ...;
                    # confirmed live) use a different envelope entirely —
                    # "successful" instead of "success", with the failure
                    # reason in statusMessage/titleMessage rather than a
                    # "message"/"error" field. Without this, a real failure
                    # here (e.g. INVALID_ITEM_IDS_IN_REQUEST) would silently
                    # report success=True with the error struct as "data".
                    parsed_res = {
                        "success": bool(structured.get("successful")),
                        "data": structured.get("data") if structured.get("successful") else None,
                        "message": structured.get("titleMessage") or structured.get("statusMessage"),
                        "raw": structured,
                    }
                else:
                    parsed_res = {"success": True, "data": structured, "message": None}
                swiggy_meta = self._extract_swiggy_meta(response_json, parsed_res)
                self._log_deprecation_if_present(tool_name, request_id, swiggy_meta)
                self._record_tool_completion(
                    tool_name, request_id, started_at, success=True,
                    status_code=response.status_code, swiggy_meta=swiggy_meta,
                )
                return parsed_res

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
            # str(e) alone is just requests' generic "406 Client Error: Not
            # Acceptable for url: ..." — it throws away whatever Swiggy
            # actually said was wrong. Surface that body (truncated) so a
            # domain_failure is diagnosable from the error message alone.
            body_snippet = ""
            if getattr(e, "response", None) is not None:
                try:
                    body_snippet = f" | Swiggy response: {e.response.text[:300]}"
                except Exception:
                    pass
            error_category = "upstream_error"
            if status in _AUTH_HTTP_STATUSES:
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
            raise SwiggyMCPError(f"HTTP request to Swiggy MCP failed: {str(e)}{body_snippet}", status_code=status) from e

    def _unpack_and_normalize(self, envelope: Dict[str, Any]) -> Any:
        """Unpacks data or raises a clean client error from Swiggy's response envelope."""
        success = envelope.get("success", False)
        data = envelope.get("data")
        msg = envelope.get("message")

        if success:
            return data

        # Parse error message from Swiggy error block or fallback message
        err = envelope.get("error") if isinstance(envelope.get("error"), dict) else {}
        err_msg = err.get("message") or msg or "Unknown error occurred"

        if is_auth_failure(err_msg, code=err.get("code")):
            raise SwiggyAuthError(f"Unauthenticated: {err_msg}")

        raise SwiggyMCPError(err_msg)

    @staticmethod
    def _unwrap_list(data: Any, key: str) -> List[Dict[str, Any]]:
        """Real Swiggy responses (both Food's structuredContent and
        Instamart's data field) wrap list payloads under a named key (e.g.
        {"addresses": [...]}, {"items": [...]}, {"products": [...]}) rather
        than as a bare list — confirmed against real, non-mock calls."""
        if isinstance(data, dict) and isinstance(data.get(key), list):
            return data[key]
        return data if isinstance(data, list) else []


class SwiggyFoodMCPClient(_SwiggyMCPTransport):
    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None) -> None:
        settings = get_settings()
        super().__init__(base_url=base_url or settings.swiggy_mcp_base_url, token=token)

    # Standard aligned Food tools:
    def get_addresses(self) -> List[Dict[str, Any]]:
        res = self.call_tool("get_addresses", {})
        return self._unwrap_list(self._unpack_and_normalize(res), "addresses")

    def search_restaurants(self, addressId: str, query: str, offset: Optional[int] = None) -> List[Dict[str, Any]]:
        args = {"addressId": addressId, "query": query}
        if offset is not None:
            args["offset"] = offset
        res = self.call_tool("search_restaurants", args)
        return self._unwrap_list(self._unpack_and_normalize(res), "restaurants")

    def search_menu(self, addressId: str, query: str, restaurantIdOfAddedItem: Optional[str] = None, vegFilter: Optional[int] = None, offset: Optional[int] = None) -> List[Dict[str, Any]]:
        args = {"addressId": addressId, "query": query}
        if restaurantIdOfAddedItem is not None:
            args["restaurantIdOfAddedItem"] = restaurantIdOfAddedItem
        if vegFilter is not None:
            args["vegFilter"] = vegFilter
        if offset is not None:
            args["offset"] = offset
        res = self.call_tool("search_menu", args)
        return self._unwrap_list(self._unpack_and_normalize(res), "items")

    def get_restaurant_menu(self, addressId: str, restaurantId: str, page: Optional[int] = None, pageSize: Optional[int] = None) -> List[Dict[str, Any]]:
        args = {"addressId": addressId, "restaurantId": restaurantId}
        if page is not None:
            args["page"] = page
        if pageSize is not None:
            args["pageSize"] = pageSize
        res = self.call_tool("get_restaurant_menu", args)
        data = self._unpack_and_normalize(res)
        # Real shape nests items two levels deep: {"restaurant": {...},
        # "categories": [{"title": ..., "items": [...]}]} — not a flat list.
        if isinstance(data, dict) and isinstance(data.get("categories"), list):
            flattened: List[Dict[str, Any]] = []
            for category in data["categories"]:
                items = category.get("items") if isinstance(category, dict) else None
                if isinstance(items, list):
                    flattened.extend(items)
            return flattened
        return data if isinstance(data, list) else []

    def get_restaurant_menu_with_metadata(self, addressId: str, restaurantId: str) -> Dict[str, Any]:
        """
        Same call as get_restaurant_menu, but also keeps the "restaurant"
        object (confirmed live: {"id", "name", "isOpen", "avgRating",
        "deliveryTime", ...}) instead of discarding it — search_menu results
        carry no open/closed or rating signal at all, so this is how the
        primary recommendation path can verify a restaurant is actually open
        before recommending its items, per Swiggy's own guidance.
        """
        args = {"addressId": addressId, "restaurantId": restaurantId}
        res = self.call_tool("get_restaurant_menu", args)
        data = self._unpack_and_normalize(res)
        if not isinstance(data, dict):
            return {"restaurant": {}, "items": []}

        restaurant = data.get("restaurant") if isinstance(data.get("restaurant"), dict) else {}
        items: List[Dict[str, Any]] = []
        for category in data.get("categories") or []:
            cat_items = category.get("items") if isinstance(category, dict) else None
            if isinstance(cat_items, list):
                items.extend(cat_items)
        return {"restaurant": restaurant, "items": items}

    def update_food_cart(self, restaurantId: str, cartItems: List[Dict[str, Any]], addressId: str, restaurantName: Optional[str] = None) -> Dict[str, Any]:
        args = {
            "restaurantId": restaurantId,
            "cartItems": cartItems,
            "addressId": addressId
        }
        if restaurantName is not None:
            args["restaurantName"] = restaurantName
        res = self.call_tool("update_food_cart", args)
        # data can legitimately be None (e.g. an empty cart) — the return
        # type promises a dict, so callers can .get() without a null check.
        return normalize_food_cart(self._unpack_and_normalize(res) or {})

    def get_food_cart(self, addressId: str, restaurantName: Optional[str] = None) -> Dict[str, Any]:
        args = {"addressId": addressId}
        if restaurantName is not None:
            args["restaurantName"] = restaurantName
        res = self.call_tool("get_food_cart", args)
        return normalize_food_cart(self._unpack_and_normalize(res) or {})

    def get_food_orders(self, addressId: str, orderCount: Optional[int] = None) -> List[Dict[str, Any]]:
        args = {"addressId": addressId}
        if orderCount is not None:
            args["orderCount"] = orderCount
        res = self.call_tool("get_food_orders", args)
        return self._unwrap_list(self._unpack_and_normalize(res), "orders")

    def fetch_food_coupons(self, restaurantId: str, addressId: str, couponCode: Optional[str] = None) -> List[Dict[str, Any]]:
        args = {"restaurantId": restaurantId, "addressId": addressId}
        if couponCode is not None:
            args["couponCode"] = couponCode
        res = self.call_tool("fetch_food_coupons", args)
        data = self._unpack_and_normalize(res)
        # fetch_food_coupons.md: coupons are grouped as
        # data.coupon_sections[].coupons[] — there is no flat "coupons" list,
        # which is what this used to read, so live coupons always came back
        # empty. Flatten the sections; skip ones Swiggy marks not applicable.
        if isinstance(data, dict) and isinstance(data.get("coupon_sections"), list):
            flattened: List[Dict[str, Any]] = []
            for section in data["coupon_sections"]:
                coupons = section.get("coupons") if isinstance(section, dict) else None
                for coupon in coupons if isinstance(coupons, list) else []:
                    if isinstance(coupon, dict) and coupon.get("applicable") is not False:
                        flattened.append(coupon)
            return flattened
        return self._unwrap_list(data, "coupons")

    def apply_food_coupon(self, couponCode: str, addressId: str, cartId: Optional[str] = None) -> Dict[str, Any]:
        args = {"couponCode": couponCode, "addressId": addressId}
        if cartId is not None:
            args["cartId"] = cartId
        res = self.call_tool("apply_food_coupon", args)
        return self._unpack_and_normalize(res) or {}

    def place_food_order(self, addressId: str, paymentMethod: Optional[str] = "Cash") -> Dict[str, Any]:
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
        return self._unpack_and_normalize(res) or {}

    def flush_food_cart(self) -> Dict[str, Any]:
        """Clears the staging cart. Swiggy flush_food_cart takes no tool arguments."""
        res = self.call_tool("flush_food_cart", {})
        return self._unpack_and_normalize(res) or {}

    def report_error(
        self,
        tool: str,
        error_message: str,
        domain: Optional[str] = None,
        flow_description: Optional[str] = None,
        tool_context: Optional[Dict[str, Any]] = None,
        user_notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generates a Swiggy-side diagnostic report for a failed tool call —
        logged server-side on their end regardless of whether the returned
        mailto: link is ever clicked (per docs)."""
        args: Dict[str, Any] = {"tool": tool, "errorMessage": error_message}
        if domain is not None:
            args["domain"] = domain
        if flow_description is not None:
            args["flowDescription"] = flow_description
        if tool_context is not None:
            args["toolContext"] = tool_context
        if user_notes is not None:
            args["userNotes"] = user_notes
        res = self.call_tool("report_error", args)
        return self._unpack_and_normalize(res) or {}


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
        # Confirmed against a real response: unlike Food's tools, Instamart
        # puts the full documented {success, data, message} envelope as JSON
        # text in content[0].text (no structuredContent at all) — the
        # original assumption was actually right here. data.products is a
        # named-key wrap, same convention as every Food list tool.
        return self._unwrap_list(self._unpack_and_normalize(res), "products")

    def update_cart(self, selectedAddressId: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Replaces the entire Instamart cart with the given [{spinId, quantity}, ...] items."""
        args = {"selectedAddressId": selectedAddressId, "items": items}
        res = self.call_tool("update_cart", args)
        return self._unpack_and_normalize(res) or {}

    def get_cart(self) -> Dict[str, Any]:
        res = self.call_tool("get_cart", {})
        return self._unpack_and_normalize(res) or {}

    def clear_cart(self) -> Dict[str, Any]:
        """Confirmed live: update_cart(items=[]) is rejected ("items array is
        required and must contain at least one item") — clearing the cart
        requires this dedicated tool instead."""
        res = self.call_tool("clear_cart", {})
        return self._unpack_and_normalize(res) or {}

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
        return self._unpack_and_normalize(res) or {}

    def track_order(self, orderId: str, lat: float, lng: float) -> Dict[str, Any]:
        args = {"orderId": orderId, "lat": lat, "lng": lng}
        res = self.call_tool("track_order", args)
        return self._unpack_and_normalize(res) or {}
