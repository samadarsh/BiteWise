import random
import time
from typing import Any, Callable, TypeVar
from agent.observability import log_info, log_warn, log_error, metrics_tracker

T = TypeVar("T")

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
        if res.get("success"):
            log_info("Order placed successfully.", extra={"order_id": res.get("order_id")})
            return res
        else:
            log_error(f"Order placement rejected by server: {res.get('message')}", error_category="domain_failure")
            metrics_tracker.record_order(success=False)
            return res
    except Exception as e:
        # A network timeout/5xx occurred *during* placement. We CANNOT simply retry.
        # We must poll get_food_orders to see if the order went through.
        log_error(f"Network error during order placement: {str(e)}. Verifying placement status...", error_category="network_error")
        metrics_tracker.record_order(success=False)
        
        # Poll up to 3 times to verify status
        for verify_attempt in range(3):
            time.sleep(2 * (verify_attempt + 1))
            try:
                orders = check_status_fn()
                if orders:
                    # Look for a recently placed order
                    latest_order = orders[0] # assuming sorted by recent
                    log_warn(
                        f"Verified order placement status. Found recent order ID: {latest_order.get('order_id')}",
                        extra={"order_id": latest_order.get("order_id"), "status": latest_order.get("status")}
                    )
                    return {
                        "success": True,
                        "message": "Order was successfully placed despite connection timeout.",
                        "order_id": latest_order.get("order_id"),
                        "status": latest_order.get("status"),
                        "recovered": True
                    }
            except Exception as check_err:
                log_error(f"Failed status verification poll {verify_attempt + 1}: {str(check_err)}", error_category="upstream_error")

        return {
            "success": False,
            "message": "Order placement timed out and status verification failed. Please check active orders manually.",
            "error_type": "placement_uncertain"
        }
