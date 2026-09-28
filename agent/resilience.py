import random
import time
from typing import Any, Callable, TypeVar
from agent.observability import log_info, log_warn, log_error, metrics_tracker

T = TypeVar("T")

def is_ambiguous_failure(e: Exception) -> bool:
    """Helper to classify if an exception represents an ambiguous ordering failure.

    Ambiguous failures are timeouts, connection errors, or HTTP 5xx responses.
    Explicit 4xx errors, validation errors, or safety lock failures are NOT ambiguous
    and must fail closed immediately.
    """
    from mcp.mcp_client import SwiggyMCPError
    import requests

    err_msg = str(e).lower()

    # 1. SwiggyMCPError classification
    if isinstance(e, SwiggyMCPError):
        # Safety Lock failures are never ambiguous
        if "safety lock" in err_msg:
            return False
        # If status code is 4xx, it's non-ambiguous (bad request, auth error, etc.)
        if e.status_code is not None and 400 <= e.status_code < 500:
            return False
        if e.status_code is not None and e.status_code >= 500:
            return True

        # Status-less MCP domain errors are only ambiguous when their message
        # clearly points to transport failure or an upstream 5xx condition.
        return any(
            marker in err_msg
            for marker in ("timeout", "timed out", "connect", "connection", "500", "502", "503", "504", "server error")
        )

    # 2. requests timeout/connection failures
    if isinstance(e, (requests.Timeout, requests.ConnectionError)):
        return True

    # 3. Categorization by string match
    if "safety lock" in err_msg or "unauthorized" in err_msg or "unauthenticated" in err_msg:
        return False
    if "400" in err_msg or "401" in err_msg or "403" in err_msg or "409" in err_msg:
        return False

    # Check if timeout, connection, or 5xx/server error is indicated
    if "timeout" in err_msg or "connect" in err_msg or "500" in err_msg or "502" in err_msg or "503" in err_msg or "504" in err_msg:
        return True

    # Default to False for other local python exceptions (e.g. ValueError, TypeError)
    return False


def retry_with_backoff(
    max_retries: int = 5,
    initial_delay: float = 0.5,
    backoff_factor: float = 2.0,
    jitter: bool = True,
    error_categories_to_retry: list[str] = None
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Decorator to retry a function call with exponential backoff and jitter."""
    if error_categories_to_retry is None:
        error_categories_to_retry = ["network_error", "upstream_timeout", "upstream_error", "rate_limited"]

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        def wrapper(*args: Any, **kwargs: Any) -> T:
            delay = initial_delay
            last_exception = None

            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    # Categorize the exception
                    err_msg = str(e).lower()
                    err_cat = "unknown"
                    if "timeout" in err_msg or "504" in err_msg:
                        err_cat = "upstream_timeout"
                    elif "429" in err_msg or "rate limit" in err_msg:
                        err_cat = "rate_limited"
                    elif "401" in err_msg or "unauthenticated" in err_msg:
                        err_cat = "unauthenticated"
                    elif "502" in err_msg or "503" in err_msg:
                        err_cat = "upstream_error"
                    elif "network" in err_msg or "connect" in err_msg:
                        err_cat = "network_error"

                    # If this category should not be retried, raise immediately
                    if err_cat not in error_categories_to_retry or attempt == max_retries:
                        log_error(
                            f"Execution failed on final attempt or error is non-retryable. Function: {func.__name__}. Error: {str(e)}",
                            error_category=err_cat,
                            extra={"attempt": attempt, "max_retries": max_retries}
                        )
                        raise e

                    # Otherwise, back off and retry
                    metrics_tracker.record_retry()
                    current_delay = delay
                    if jitter:
                        current_delay *= random.uniform(0.5, 1.5)

                    log_warn(
                        f"Retrying function {func.__name__} due to {err_cat}. Attempt {attempt + 1}/{max_retries} after {current_delay:.2f}s. Error: {str(e)}",
                        extra={"attempt": attempt + 1, "delay_sec": current_delay}
                    )
                    time.sleep(current_delay)
                    delay *= backoff_factor

            raise last_exception  # Fallback: should not be reached

        return wrapper
    return decorator

def _order_id(order: dict) -> Any:
    return order.get("orderId") or order.get("order_id") if isinstance(order, dict) else None


def place_order_safely(place_order_fn: Callable[[], dict], check_status_fn: Callable[[], list[dict]]) -> dict:
    """Places a non-idempotent order, recovering safely from ambiguous failures.

    Before placing, snapshot the IDs of the user's existing orders. If the
    placement call then times out / 5xxs, poll the order list and accept
    only an order whose ID was NOT in that snapshot — that one is ours.

    This replaces two broken heuristics:
      - blocking placement whenever ANY past order had status
        "confirmed"/"delivered" (so after one order, every later order was
        rejected as a "duplicate" forever — and against real Swiggy, whose
        orders carry `orderStatus`/`isActiveOrder` rather than `status`, it
        never matched at all);
      - treating orders[0] as "ours" after a timeout, which could report an
        old order as a fresh success.
    Double-submit protection lives in the order route instead (per-session
    state machine + a short per-user placement window).
    """
    snapshot_ok = True
    try:
        existing_ids = {_order_id(o) for o in (check_status_fn() or [])}
        existing_ids.discard(None)
    except Exception as e:
        snapshot_ok = False
        existing_ids = set()
        log_error(f"Failed to snapshot orders before placement: {str(e)}", error_category="upstream_error")

    log_info("Initiating order placement call...")

    try:
        res = place_order_fn() or {}
    except Exception as e:
        if not is_ambiguous_failure(e):
            log_error(f"Non-ambiguous error during order placement: {str(e)}. Failing fast.", error_category="domain_failure")
            metrics_tracker.record_order(success=False)
            raise e

        # A timeout/5xx *during* placement: the order may or may not exist.
        # Never retry blindly — look for a new order instead.
        log_error(f"Network error/timeout during order placement: {str(e)}. Verifying placement status...", error_category="network_error")
        if snapshot_ok:
            for verify_attempt in range(3):
                time.sleep(2 * (verify_attempt + 1))
                try:
                    for order in check_status_fn() or []:
                        order_id = _order_id(order)
                        if order_id and order_id not in existing_ids:
                            log_warn(f"Verified order placement after timeout. Order ID: {order_id}", extra={"order_id": order_id})
                            metrics_tracker.record_order(success=True)
                            return {
                                "success": True,
                                "message": order.get("message") or "Order was successfully placed despite connection timeout.",
                                "order_id": order_id,
                                "status": order.get("orderStatus") or order.get("status") or "CONFIRMED",
                                "recovered": True,
                            }
                except Exception as check_err:
                    log_error(f"Failed status verification poll {verify_attempt + 1}: {str(check_err)}", error_category="upstream_error")

        metrics_tracker.record_order(success=False)
        return {
            "success": False,
            "message": "Order placement timed out and we couldn't confirm whether it went through. Check your Swiggy app before trying again.",
            "error_type": "placement_uncertain",
        }

    msg = res.get("message") or "Order placed successfully."
    status = str(res.get("status") or "").upper()
    # Per the place_food_order docs, a UPI order comes back
    # status="PENDING_PAYMENT" and is NOT placed yet.
    if status == "PENDING_PAYMENT" or res.get("normalizedStatus") == "pending":
        metrics_tracker.record_order(success=False)
        return {
            "success": False,
            "message": "Payment is still pending — the order isn't placed yet. Complete payment in your UPI app.",
            "order_id": _order_id(res),
            "error_type": "payment_pending",
        }

    order_id = _order_id(res)
    if res.get("success") or order_id:
        log_info(f"Order placed successfully: {msg}", extra={"order_id": order_id})
        metrics_tracker.record_order(success=True)
        return {
            "success": True,
            "message": msg,
            "order_id": order_id,
            "status": res.get("status", "CONFIRMED"),
        }

    log_error(f"Order placement rejected by server: {msg}", error_category="domain_failure")
    metrics_tracker.record_order(success=False)
    return {"success": False, "message": msg}
