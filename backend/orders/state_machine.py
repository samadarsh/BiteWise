from enum import Enum
from typing import Dict, Any, List, Optional
import datetime
from sqlalchemy.orm import Session
from backend.db.models import OrderSession, OrderEvent

class OrderStatus(str, Enum):
    START = "START"
    ADDRESS_SELECTED = "ADDRESS_SELECTED"
    SEARCHING = "SEARCHING"
    RECOMMENDATIONS_READY = "RECOMMENDATIONS_READY"
    ITEM_SELECTED = "ITEM_SELECTED"
    CART_UPDATED = "CART_UPDATED"
    CART_REVIEW_READY = "CART_REVIEW_READY"
    USER_CONFIRMED = "USER_CONFIRMED"
    ORDER_PLACING = "ORDER_PLACING"
    ORDER_PLACED = "ORDER_PLACED"
    TRACKING = "TRACKING"
    FAILED = "FAILED"

# Allowed transition rules. Placement safety lives at the end of the flow
# (only USER_CONFIRMED -> ORDER_PLACING, only via the confirm step); the
# earlier steps must tolerate what users actually do — search again, pick a
# different meal, reopen the cart — or the flow dead-ends in a raw 500.
_EDITABLE_AFTER_SEARCH = [OrderStatus.SEARCHING, OrderStatus.ITEM_SELECTED, OrderStatus.FAILED]

ALLOWED_TRANSITIONS = {
    OrderStatus.START: [OrderStatus.ADDRESS_SELECTED],
    OrderStatus.ADDRESS_SELECTED: [OrderStatus.SEARCHING, OrderStatus.START, OrderStatus.ITEM_SELECTED],
    OrderStatus.SEARCHING: [OrderStatus.RECOMMENDATIONS_READY, OrderStatus.FAILED],
    OrderStatus.RECOMMENDATIONS_READY: [OrderStatus.ITEM_SELECTED, OrderStatus.SEARCHING],
    OrderStatus.ITEM_SELECTED: [OrderStatus.CART_UPDATED, *_EDITABLE_AFTER_SEARCH],
    OrderStatus.CART_UPDATED: [OrderStatus.CART_REVIEW_READY, OrderStatus.USER_CONFIRMED, *_EDITABLE_AFTER_SEARCH],
    OrderStatus.CART_REVIEW_READY: [OrderStatus.USER_CONFIRMED, OrderStatus.CART_UPDATED, *_EDITABLE_AFTER_SEARCH],
    # Changing the meal after ticking "confirm" drops the confirmation —
    # the user has to confirm the new cart before it can be placed.
    OrderStatus.USER_CONFIRMED: [OrderStatus.ORDER_PLACING, OrderStatus.CART_REVIEW_READY, *_EDITABLE_AFTER_SEARCH],
    OrderStatus.ORDER_PLACING: [OrderStatus.ORDER_PLACED, OrderStatus.FAILED],
    OrderStatus.ORDER_PLACED: [OrderStatus.TRACKING],
    OrderStatus.TRACKING: [],
    # ITEM_SELECTED lets a failed cart sync (e.g. an item that just went
    # unavailable — confirmed happening live, Swiggy's own menus/availability
    # change through the day) be recovered by picking a different item,
    # without forcing the user all the way back to address selection.
    OrderStatus.FAILED: [OrderStatus.START, OrderStatus.ITEM_SELECTED, OrderStatus.SEARCHING],
}

# Steps a user can legitimately repeat (reopening the cart, re-picking the
# same address) — a repeat is a no-op, not an error.
_REPEATABLE = {
    OrderStatus.ADDRESS_SELECTED,
    OrderStatus.SEARCHING,
    OrderStatus.ITEM_SELECTED,
    OrderStatus.CART_UPDATED,
    OrderStatus.CART_REVIEW_READY,
    OrderStatus.USER_CONFIRMED,
    OrderStatus.FAILED,
}

def utc_now_naive() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class IllegalTransitionError(ValueError):
    """An order-flow step taken out of order. Mapped to a 409 with a readable
    message by backend/main.py instead of surfacing as a raw 500."""
    def __init__(self, current: "OrderStatus", target: "OrderStatus") -> None:
        super().__init__(f"Illegal state transition from {current.value} to {target.value}")
        self.current = current
        self.target = target


def validate_state_transition(current: OrderStatus, target: OrderStatus) -> bool:
    """
    Returns True if target state transition is permitted under strict safety guidelines.
    """
    if current == target and current in _REPEATABLE:
        return True
    return target in ALLOWED_TRANSITIONS.get(current, [])

def transition_session_status(db: Session, session_record: OrderSession, target: OrderStatus, event_type: str = "STATUS_TRANSITION", payload: Optional[Dict[str, Any]] = None) -> OrderSession:
    """
    Safely transitions the session state and logs a status transition event in the DB.
    """
    current = OrderStatus(session_record.status)
    if not validate_state_transition(current, target):
        raise IllegalTransitionError(current, target)
        
    session_record.status = target.value
    # UTC, matching the column's func.now() default/onupdate (SQLite's
    # CURRENT_TIMESTAMP is UTC) — mixing local and UTC made recency checks
    # on updated_at off by the server's UTC offset.
    session_record.updated_at = utc_now_naive()
    
    # Create audit event
    default_payload = {"from_status": current.value, "to_status": target.value}
    if payload:
        default_payload.update(payload)
        
    event = OrderEvent(
        order_session_id=session_record.id,
        event_type=event_type,
        payload=default_payload
    )
    db.add(event)
    db.commit()
    db.refresh(session_record)
    return session_record

def mark_session_failed(db: Session, session_record: OrderSession, event_type: str = "STATUS_TRANSITION", payload: Optional[Dict[str, Any]] = None) -> OrderSession:
    """
    Marks a session FAILED, tolerating a session that's already FAILED.

    Every route's exception handler unconditionally called
    transition_session_status(..., OrderStatus.FAILED) on any Swiggy error —
    but FAILED's only allowed forward transition is START, so a session that
    fails twice (confirmed live: retrying cart sync with a different item
    after the first one turned out to be unavailable, then that one also
    failing) hit an illegal FAILED -> FAILED transition and crashed with a
    raw 500 instead of the clean error response it was already returning.
    """
    if OrderStatus(session_record.status) == OrderStatus.FAILED:
        return session_record
    return transition_session_status(db, session_record, OrderStatus.FAILED, event_type=event_type, payload=payload)
