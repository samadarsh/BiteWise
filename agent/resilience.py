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

def place_order_safely(place_order_fn: Callable[[], dict], check_status_fn: Callable[[], list[dict]]) -> dict:
    """Safely places an order.

    Since placing an order is non-idempotent, we check active food orders first,
    or verify order status if a previous check indicates a potential double placement risk.
    """
    # Check if there's already an active order placed in the last minute to prevent accidental double-submit
    try:
        active_orders = check_status_fn()
        if active_orders:
            # Check if any order is very recent
            # (In mock mode or simple client, we can look at the latest order status)
            for order in active_orders:
                if order.get("status") in ["confirmed", "cooking", "delivered"] and order.get("is_recent", True):
                    log_warn("Detected a recent active order. Blocking duplicate placement request.", extra={"order_id": order.get("order_id")})
                    return {
                        "success": False,
                        "message": f"An active order ({order.get('order_id')}) is already in progress. Double placement blocked.",
                        "order_id": order.get("order_id"),
                        "already_placed": True
                    }
    except Exception as e:
        # Log and proceed, we don't want check failures to block first-time orders completely
        log_error(f"Failed to check recent orders before placement: {str(e)}", error_category="upstream_error")

    # Now execute the placement
    log_info("Initiating order placement call...")
    metrics_tracker.record_order(success=True) # Will override if fails

    try:
        res = place_order_fn()
        # Preserve actual message from Swiggy tool call
        msg = res.get("message") or "Order placed successfully."
        if res.get("success") or res.get("orderId") or res.get("order_id"):
            log_info(f"Order placed successfully: {msg}", extra={"order_id": res.get("order_id") or res.get("orderId")})
            # Ensure unified return fields
            return {
                "success": True,
                "message": msg,
                "order_id": res.get("order_id") or res.get("orderId"),
                "status": res.get("status", "confirmed")
            }
        else:
            log_error(f"Order placement rejected by server: {msg}", error_category="domain_failure")
            metrics_tracker.record_order(success=False)
            return res
    except Exception as e:
        # Check if the failure is ambiguous (timeout, connection, or 5xx)
        if not is_ambiguous_failure(e):
            log_error(f"Non-ambiguous error during order placement: {str(e)}. Failing fast.", error_category="domain_failure")
            raise e

        # A network timeout/5xx occurred *during* placement. We CANNOT simply retry.
        # We must poll get_food_orders to see if the order went through.
        log_error(f"Network error/timeout during order placement: {str(e)}. Verifying placement status...", error_category="network_error")
        metrics_tracker.record_order(success=False)

        # Poll up to 3 times to verify status
        for verify_attempt in range(3):
            time.sleep(2 * (verify_attempt + 1))
            try:
                orders = check_status_fn()
                if orders:
                    # Look for a recently placed order (within the last 60 seconds)
                    # or simply the latest order returned if no timestamp is present
                    latest_order = orders[0]
                    order_id = latest_order.get("orderId") or latest_order.get("order_id")

                    # Verify if timestamp is recent (less than 60s ago)
                    timestamp = latest_order.get("timestamp", 0)
                    is_recent = True
                    if timestamp:
                        if (time.time() - timestamp) > 60:
                            is_recent = False

                    if is_recent:
                        log_warn(
                            f"Verified order placement status. Found recent order ID: {order_id}",
                            extra={"order_id": order_id, "status": latest_order.get("status")}
                        )
                        return {
                            "success": True,
                            "message": latest_order.get("message") or "Order was successfully placed despite connection timeout.",
                            "order_id": order_id,
                            "status": latest_order.get("status", "confirmed"),
                            "recovered": True
                        }
            except Exception as check_err:
                log_error(f"Failed status verification poll {verify_attempt + 1}: {str(check_err)}", error_category="upstream_error")

        return {
            "success": False,
            "message": "Order placement timed out and status verification failed. Please check active orders manually.",
            "error_type": "placement_uncertain"
        }
