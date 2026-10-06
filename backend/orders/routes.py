from typing import Dict, Any, List, Optional
import time
import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from backend.auth.sessions import get_current_user_id
from backend.auth.rate_limiter import mutating_rate_limiter
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import OrderSession
from backend.orders.state_machine import OrderStatus, validate_state_transition, transition_session_status, mark_session_failed, IllegalTransitionError, utc_now_naive
from mcp.mcp_client import SwiggyAuthError, SwiggyMCPError, cart_total

router = APIRouter(prefix="/orders", tags=["Order Sessions"])

RECENT_PLACEMENT_WINDOW_SECONDS = 60


class OrderSessionSummary(BaseModel):
    session_id: str
    status: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    restaurant_name: Optional[str] = None
    meal_name: Optional[str] = None
    total: Optional[float] = None
    mcp_mode: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/sessions", response_model=List[OrderSessionSummary])
def list_order_sessions(
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> List[OrderSessionSummary]:
    """
    Lists the caller's order sessions, most recent first, for the NutriOrder
    order-history page. Read-only — does not touch session state.
    """
    records = (
        db.query(OrderSession)
        .filter(
            OrderSession.user_id == user_id,
            # A session is opened as soon as an address is picked (every
            # visit to the Order page) — ones that never got further aren't
            # orders and just cluttered history as "In-progress session".
            OrderSession.status.notin_([OrderStatus.START.value, OrderStatus.ADDRESS_SELECTED.value]),
        )
        .order_by(OrderSession.created_at.desc())
        .limit(limit)
        .all()
    )
    summaries: List[OrderSessionSummary] = []
    for record in records:
        nutrition = record.selected_item_nutrition or {}
        summaries.append(
            OrderSessionSummary(
                session_id=record.id,
                status=record.status,
                created_at=record.created_at,
                updated_at=record.updated_at,
                restaurant_name=nutrition.get("restaurant_name"),
                meal_name=nutrition.get("item_name"),
                total=record.total,
                mcp_mode=record.mcp_mode,
            )
        )
    return summaries


@router.post("/session/start")
def start_order_session(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Spawns a new order session and sets initial state to START.
    """
    import secrets
    from config.settings import get_settings
    session_id = f"session_{secrets.token_hex(6)}"
    new_session = OrderSession(
        id=session_id,
        user_id=user_id,
        status=OrderStatus.START.value,
        mcp_mode="mock" if get_settings().use_mock_mcp else "live"
    )
    db.add(new_session)
    db.commit()
    return {
        "session_id": session_id,
        "status": OrderStatus.START.value
    }

@router.post("/session/{session_id}/select-address")
def select_address(
    session_id: str,
    address_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Binds the user-selected addressId to the current order session.
    Persists matched address metadata dynamically to delivery_addresses table.
    """
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    session_record.address_id = address_id

    # Persist address metadata to delivery_addresses table
    try:
        from backend.db.models import DeliveryAddress
        from backend.mcp.swiggy_client import ProductionSwiggyClient
        import datetime

        swiggy = ProductionSwiggyClient(user_id=user_id)
        addresses = swiggy.get_addresses()
        match = next((a for a in addresses if a.get("id") == address_id), None)

        if match:
            label = match.get("label") or "Address"
            text = match.get("display_text") or match.get("text") or "Saved Address"

            addr_rec = db.query(DeliveryAddress).filter(
                DeliveryAddress.user_id == user_id,
                DeliveryAddress.address_id == address_id
            ).first()

            if not addr_rec:
                addr_rec = DeliveryAddress(
                    user_id=user_id,
                    address_id=address_id,
                    label=label,
                    display_text=text,
                    last_selected_at=datetime.datetime.now()
                )
                db.add(addr_rec)
            else:
                addr_rec.label = label
                addr_rec.display_text = text
                addr_rec.last_selected_at = datetime.datetime.now()
            db.commit()
    except Exception as addr_err:
        from agent.observability import log_warn
        log_warn(f"Failed to upsert delivery address metadata in database: {str(addr_err)}")

    transition_session_status(db, session_record, OrderStatus.ADDRESS_SELECTED)
    db.commit()

    return {
        "session_id": session_id,
        "address_id": address_id,
        "status": OrderStatus.ADDRESS_SELECTED.value
    }

@router.post("/session/{session_id}/select-item")
def select_item(
    session_id: str,
    restaurant_id: str = Query(..., description="ID of the selected restaurant"),
    item_id: str = Query(..., description="ID of the selected menu item"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Selects a specific meal item for the order session, transitioning status to ITEM_SELECTED.
    Caches the item's nutrition details non-blockingly to database.
    """
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    session_record.selected_restaurant_id = restaurant_id
    session_record.selected_item_id = item_id

    # Non-blocking nutrition caching
    try:
        from backend.mcp.swiggy_client import ProductionSwiggyClient
        swiggy = ProductionSwiggyClient(user_id=user_id)
        client = swiggy._get_initialized_client()

        address_id = session_record.address_id or "addr_home"
        menu = client.get_restaurant_menu(addressId=address_id, restaurantId=restaurant_id)

        item_details = next((i for i in menu if str(i.get("id")) == str(item_id)), None)
        if item_details:
            meal_name = item_details.get("name", "Swiggy Meal")
            resolved_restaurant_name = "Swiggy Restaurant"
            if hasattr(client, "_restaurants"):
                for r in client._restaurants:
                    if r["id"] == restaurant_id:
                        resolved_restaurant_name = r["name"]
                        break

            from agent.nutrition_estimator import NutritionEstimator
            desc = item_details.get("description") or item_details.get("item_description") or ""
            est = NutritionEstimator.estimate_nutrition(meal_name, desc)

            verified_protein = item_details.get("protein_g")
            verified_cal = item_details.get("calories")
            is_estimated = not (verified_protein and verified_cal)

            protein = verified_protein if verified_protein else est["estimated_protein_g"]
            calories = verified_cal if verified_cal else est["estimated_calories"]
            fat = item_details.get("fat_g") or est["estimated_fat_g"]
            carbs = item_details.get("carbs_g") or est["estimated_carbs_g"]
            confidence = 1.0 if not is_estimated else est["confidence"]

            session_record.selected_item_nutrition = {
                "item_id": item_id,
                "item_name": meal_name,
                "restaurant_id": restaurant_id,
                "restaurant_name": resolved_restaurant_name,
                "protein_g": float(protein),
                "calories": float(calories),
                "carbs_g": float(carbs) if carbs is not None else None,
                "fat_g": float(fat) if fat is not None else None,
                "confidence": float(confidence),
                "is_estimated": bool(is_estimated)
            }
    except Exception as cache_err:
        from agent.observability import log_warn
        log_warn(f"Non-blocking nutrition cache failed during item selection: {str(cache_err)}")

    transition_session_status(db, session_record, OrderStatus.ITEM_SELECTED)
    db.commit()

    return {
        "session_id": session_id,
        "restaurant_id": restaurant_id,
        "item_id": item_id,
        "status": OrderStatus.ITEM_SELECTED.value
    }

@router.post("/session/{session_id}/cart")
def sync_cart(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter),
    allow_restaurant_switch: bool = Query(False, description="User confirmed that an existing cart from another restaurant may be replaced.")
) -> Dict[str, Any]:
    """
    Adds the selected menu item to the user's Swiggy cart, transitioning state to CART_UPDATED.
    """
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    if not session_record.selected_restaurant_id or not session_record.selected_item_id:
        raise HTTPException(status_code=400, detail="Must select a restaurant and item first.")

    try:
        from backend.mcp.swiggy_client import ProductionSwiggyClient
        swiggy = ProductionSwiggyClient(user_id=user_id)
        client = swiggy._get_initialized_client()

        address_id = session_record.address_id or "addr_home"
        # Swiggy Food carts are restaurant-bound. Refresh first so we do not
        # silently replace a cart the user or Swiggy app changed between turns.
        existing_cart = client.get_food_cart(addressId=address_id)
        existing_items = existing_cart.get("cartItems") or existing_cart.get("items") or []
        existing_restaurant_id = existing_cart.get("restaurantId")
        selected_restaurant_id = session_record.selected_restaurant_id
        if (
            existing_items
            and existing_restaurant_id
            and selected_restaurant_id
            and str(existing_restaurant_id) != str(selected_restaurant_id)
            and not allow_restaurant_switch
        ):
            session_record.cart_snapshot = existing_cart
            session_record.total = cart_total(existing_cart)
            db.commit()
            current_name = existing_cart.get("restaurantName") or "another restaurant"
            raise HTTPException(
                status_code=409,
                detail=(
                    "RESTAURANT_SWITCH_REQUIRED: Your current Swiggy cart has "
                    f"{len(existing_items)} item(s) from {current_name}. Adding this meal "
                    "will replace that cart. Please confirm before continuing."
                ),
            )

        # Update cart. "menu_item_id" is Swiggy's real request key (confirmed
        # against the Builders docs and a live INVALID_ITEM_IDS_IN_REQUEST
        # rejection) — not "itemId", which every call site here previously
        # used, including the mock client, so nothing ever caught the
        # mismatch until a real order attempt failed.
        client.update_food_cart(
            addressId=address_id,
            restaurantId=session_record.selected_restaurant_id,
            cartItems=[{"menu_item_id": session_record.selected_item_id, "quantity": 1}]
        )

        # Fetch updated cart
        cart_info = client.get_food_cart(addressId=address_id)

        # Save snapshot and transition
        session_record.cart_snapshot = cart_info
        session_record.total = cart_total(cart_info)
        transition_session_status(db, session_record, OrderStatus.CART_UPDATED)
        db.commit()

        return {
            "session_id": session_id,
            "cart": cart_info,
            "status": OrderStatus.CART_UPDATED.value
        }
    except (HTTPException, IllegalTransitionError):
        raise
    except (SwiggyAuthError, SwiggyMCPError):
        mark_session_failed(db, session_record)
        raise
    except Exception as e:
        mark_session_failed(db, session_record)
        raise HTTPException(status_code=500, detail=f"Cart sync failed: {str(e)}")

@router.get("/session/{session_id}/cart")
def review_cart(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Fetches the Swiggy cart preview and moves state to CART_REVIEW_READY.
    """
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    try:
        from backend.mcp.swiggy_client import ProductionSwiggyClient
        swiggy = ProductionSwiggyClient(user_id=user_id)
        client = swiggy._get_initialized_client()

        address_id = session_record.address_id or "addr_home"
        cart_info = client.get_food_cart(addressId=address_id)

        session_record.cart_snapshot = cart_info
        session_record.total = cart_total(cart_info)
        transition_session_status(db, session_record, OrderStatus.CART_REVIEW_READY)
        db.commit()

        return {
            "session_id": session_id,
            "cart": cart_info,
            "status": OrderStatus.CART_REVIEW_READY.value
        }
    except IllegalTransitionError:
        raise
    except (SwiggyAuthError, SwiggyMCPError):
        mark_session_failed(db, session_record)
        raise
    except Exception as e:
        mark_session_failed(db, session_record)
        raise HTTPException(status_code=500, detail=f"Cart review failed: {str(e)}")

@router.post("/session/{session_id}/confirm")
def confirm_order_details(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter)
) -> Dict[str, Any]:
    """
    Finalizes the cart selection and transitions to USER_CONFIRMED.
    """
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    current_status = OrderStatus(session_record.status)
    if current_status not in [OrderStatus.CART_UPDATED, OrderStatus.CART_REVIEW_READY]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm details when in state {current_status.value}."
        )

    transition_session_status(
        db,
        session_record,
        OrderStatus.USER_CONFIRMED,
        event_type="USER_CONFIRMATION",
        payload={"confirmed_at": str(time.time()), "total": session_record.total}
    )

    return {
        "session_id": session_id,
        "confirmed": True,
        "status": OrderStatus.USER_CONFIRMED.value
    }

@router.post("/session/{session_id}/place")
def place_order(
    session_id: str,
    user_confirmed: bool,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Performs the non-idempotent Swiggy order placement, enforcing safety locks,
    cart cost thresholds (< Rs 1000), and double-placing verification checks.
    """
    if not user_confirmed:
        raise HTTPException(status_code=400, detail="Explicit user_confirmed parameter is required.")

    # 0. Safety checkout lock checks (Ensure 403 Forbidden is explicitly returned if blocked)
    from config.settings import get_settings
    settings = get_settings()
    is_mock = settings.use_mock_mcp
    if not is_mock:
        if settings.swiggy_env != "staging" or not settings.allow_place_order:
            raise HTTPException(
                status_code=403,
                detail="Safety Lock: place_food_order is disabled unless SWIGGY_ENV=staging and ALLOW_PLACE_ORDER=true."
            )

    # 1. Fetch OrderSession from database
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()

    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    # 2. State transition check (enforce USER_CONFIRMED status before order placing)
    current_status = OrderStatus(session_record.status)
    if current_status != OrderStatus.USER_CONFIRMED:
        raise HTTPException(
            status_code=400,
            detail=f"Order cannot be placed. Current session status is {current_status.value}, expected USER_CONFIRMED."
        )

    # Double-submit guard (e.g. two tabs): refuse if another of this user's
    # sessions placed or is placing an order in the last minute. Deliberately
    # short and local — a real follow-up order a few minutes later is fine.
    recent_cutoff = utc_now_naive() - datetime.timedelta(seconds=RECENT_PLACEMENT_WINDOW_SECONDS)
    recent_other = db.query(OrderSession).filter(
        OrderSession.user_id == user_id,
        OrderSession.id != session_id,
        OrderSession.status.in_([OrderStatus.ORDER_PLACING.value, OrderStatus.ORDER_PLACED.value]),
        OrderSession.updated_at >= recent_cutoff,
    ).first()
    if recent_other:
        raise HTTPException(
            status_code=409,
            detail="Checkout blocked: you placed an order less than a minute ago. Duplicate prevention active — wait a moment and try again if this is a new order."
        )

    # Transition status to ORDER_PLACING
    transition_session_status(db, session_record, OrderStatus.ORDER_PLACING)

    try:
        # 3. Instantiate Swiggy client
        from backend.mcp.swiggy_client import ProductionSwiggyClient
        swiggy = ProductionSwiggyClient(user_id=user_id)
        client = swiggy._get_initialized_client()

        # 4. Fetch live cart to inspect total (Safety requirement)
        address_id = session_record.address_id or "addr_home"
        cart_info = client.get_food_cart(addressId=address_id)

        # Verify cart total limit (Rs 1000 limit)
        live_total = cart_total(cart_info)
        if live_total is None or (live_total <= 0 and cart_info.get("cartItems")):
            # Fail closed: an unreadable total must never pass the Rs 1000
            # cap as if it were Rs 0.
            mark_session_failed(db, session_record)
            raise HTTPException(
                status_code=400,
                detail="Checkout blocked: couldn't read the cart total from Swiggy. Please reopen your cart and try again."
            )
        if live_total >= 1000:
            mark_session_failed(db, session_record)
            raise HTTPException(
                status_code=400,
                detail=f"Checkout blocked: Cart total of Rs {live_total} exceeds the Swiggy Builders Club cap of Rs 1000."
            )

        # Dynamic payment method selection from cart details.
        # In staging/prod, never assume a payment method that Swiggy did not return.
        raw_payment_methods = cart_info.get("availablePaymentMethods", []) or []
        normalized_payment_methods = []
        for method in raw_payment_methods:
            if isinstance(method, str):
                normalized_payment_methods.append(method)
            elif isinstance(method, dict):
                method_value = (
                    method.get("method")
                    or method.get("code")
                    or method.get("type")
                    or method.get("id")
                    or method.get("name")
                )
                if method_value:
                    normalized_payment_methods.append(str(method_value))

        if not normalized_payment_methods:
            if is_mock:
                normalized_payment_methods = ["COD"]
            else:
                mark_session_failed(db, session_record)
                raise HTTPException(
                    status_code=400,
                    detail="Checkout blocked: Swiggy cart did not return any available payment methods."
                )

        payment_method = next(
            (method for method in normalized_payment_methods if method.upper() == "COD"),
            normalized_payment_methods[0]
        )
        # Swiggy's own place_food_order docs only accept paymentMethod "UPI"
        # or "Cash" — "COD" is never a documented value there, even though
        # get_food_cart's availablePaymentMethods uses "COD" as Swiggy's own
        # label for pay-on-delivery. Translate before calling the real tool;
        # store what was actually sent, not the cart's raw label.
        payment_method = "Cash" if payment_method.upper() == "COD" else payment_method

        # 5. Execute placing safely using resilience layer checkout recovery policy
        from agent.resilience import place_order_safely

        def do_place():
            return client.place_food_order(addressId=address_id, paymentMethod=payment_method)

        def do_check():
            return client.get_food_orders(addressId=address_id)

        res = place_order_safely(place_order_fn=do_place, check_status_fn=do_check)
        if not res.get("success"):
            mark_session_failed(db, session_record)
            status_code = 409 if res.get("already_placed") else 500
            error_detail = res.get("message", "Order placement failed.")
            if res.get("already_placed"):
                error_detail = f"Checkout blocked: A recent order was already placed. Duplicate prevention active. Detail: {error_detail}"
            raise HTTPException(status_code=status_code, detail=error_detail)

        # Transition status to ORDER_PLACED (the event keeps Swiggy's order
        # id so /track can follow the real order later).
        transition_session_status(
            db, session_record, OrderStatus.ORDER_PLACED,
            payload={"order_id": res.get("order_id")},
        )

        # Record final details
        session_record.selected_restaurant_id = cart_info.get("restaurantId") or session_record.selected_restaurant_id
        session_record.total = live_total
        session_record.payment_method = payment_method
        db.commit()

        # Safe, non-blocking auto-log completed order to nutrition entries
        try:
            from backend.coach.service import auto_log_ordered_meal
            auto_log_ordered_meal(db, user_id, session_record)
        except Exception as log_err:
            from agent.observability import log_error
            log_error(f"Top-level auto-log exception caught: {str(log_err)}", error_category="internal_error")

        return {
            "success": True,
            "order_id": res.get("order_id"),
            "status": OrderStatus.ORDER_PLACED.value,
            "message": res.get("message")
        }

    except (HTTPException, IllegalTransitionError):
        raise
    except (SwiggyAuthError, SwiggyMCPError):
        mark_session_failed(db, session_record)
        raise
    except Exception as e:
        # Failsafe: transition session to FAILED in case of other errors
        mark_session_failed(db, session_record)
        raise HTTPException(status_code=500, detail=f"Order placement failed: {str(e)}")



import uuid
from backend.db.models import OrderEvent, OrderFeedback, UserProfile


def _placed_order_id(db: Session, session_id: str) -> Optional[str]:
    events = (
        db.query(OrderEvent)
        .filter(OrderEvent.order_session_id == session_id)
        .order_by(OrderEvent.id.desc())
        .all()
    )
    for e in events:
        payload = e.payload or {}
        if payload.get("to_status") == OrderStatus.ORDER_PLACED.value and payload.get("order_id"):
            return str(payload["order_id"])
    return None


def _tracking_view(data: Any, order_id: str) -> Dict[str, Any]:
    """Normalizes track_food_order. Live (track_food_order.md):
    data.orders[] of {orderId, title, subtitle, etaText, orderStatus,
    progressPercentage (string)}; an order missing from the list is no
    longer active. Mock: a flat {orderId, status, message}."""
    view: Dict[str, Any] = {"active": False, "order_id": order_id, "order_status": None, "title": None,
                            "subtitle": None, "eta_text": None, "progress_percentage": None}
    if not isinstance(data, dict):
        return view
    orders = data.get("orders")
    if isinstance(orders, list):
        match = next((o for o in orders if isinstance(o, dict) and str(o.get("orderId")) == order_id), None)
        if not match:
            view["title"] = data.get("statusMessage")
            return view
        try:
            progress = float(str(match.get("progressPercentage")).rstrip("%")) if match.get("progressPercentage") is not None else None
        except ValueError:
            progress = None
        view.update(active=True, order_status=match.get("orderStatus"), title=match.get("title"),
                    subtitle=match.get("subtitle"), eta_text=match.get("etaText"), progress_percentage=progress)
        return view
    view.update(active=True, order_status=data.get("status"), title=data.get("message"))
    return view


@router.get("/session/{session_id}/track")
def track_order(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Real delivery status for a placed order via Swiggy's track_food_order.
    The frontend used to animate "Accepted / Preparing / Arriving" on a
    timer. Swiggy asks clients to poll no faster than every 10 seconds
    (order-food.md)."""
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")
    if session_record.status not in (OrderStatus.ORDER_PLACED.value, OrderStatus.TRACKING.value):
        raise HTTPException(status_code=400, detail="This order hasn't been placed yet.")

    order_id = _placed_order_id(db, session_id)
    if not order_id:
        # Without Swiggy's order id, an id-less call returns *all* active
        # orders — we can't tell which one is this order.
        return {"tracking_available": False, **_tracking_view(None, "")}

    try:
        from backend.mcp.swiggy_client import ProductionSwiggyClient
        data = ProductionSwiggyClient(user_id=user_id).track_food_order(orderId=order_id)
    except (SwiggyAuthError, SwiggyMCPError):
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Order tracking failed: {str(e)}")
    return {"tracking_available": True, **_tracking_view(data, order_id)}

class ApplyCouponSchema(BaseModel):
    coupon_code: str = Field(..., min_length=1)

@router.get("/session/{session_id}/coupons")
def get_applicable_coupons(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Fetches applicable Swiggy coupons for the session's selected restaurant and address.
    Filters out coupons that require online payment since only COD is supported.
    """
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    try:
        from backend.mcp.swiggy_client import ProductionSwiggyClient
        swiggy = ProductionSwiggyClient(user_id=user_id)

        restaurant_id = session_record.selected_restaurant_id
        if not restaurant_id and session_record.cart_snapshot:
            restaurant_id = session_record.cart_snapshot.get("restaurantId")

        if not restaurant_id:
            return {"success": True, "coupons": [], "message": "No restaurant selected yet."}

        address_id = session_record.address_id or "addr_home"
        coupons = swiggy.fetch_food_coupons(restaurantId=restaurant_id, addressId=address_id)

        # Filter COD coupons only
        cod_coupons = [c for c in coupons if not c.get("requiresOnlinePayment", False)]

        return {
            "success": True,
            "coupons": cod_coupons
        }
    except (SwiggyAuthError, SwiggyMCPError):
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch coupons: {str(e)}")

@router.post("/session/{session_id}/coupon/apply")
def apply_coupon_to_cart(
    session_id: str,
    payload: ApplyCouponSchema,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Applies the specified coupon code to the session's Swiggy cart.
    """
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    try:
        from backend.mcp.swiggy_client import ProductionSwiggyClient
        swiggy = ProductionSwiggyClient(user_id=user_id)

        address_id = session_record.address_id or "addr_home"

        apply_res = swiggy.apply_food_coupon(couponCode=payload.coupon_code, addressId=address_id)

        # Retrieve the updated cart to reflect the new total in db
        cart_info = swiggy.get_food_cart(addressId=address_id)
        session_record.cart_snapshot = cart_info
        session_record.total = cart_total(cart_info)
        db.commit()

        # Per the apply_food_coupon docs, a coupon only counts as applied when
        # the cart shows a positive coupon discount — Swiggy can return
        # success while silently not applying it.
        if not (cart_info.get("discount_amount") or 0) > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Coupon {payload.coupon_code} couldn't be applied to this cart.",
            )

        return {
            "success": True,
            "message": apply_res.get("message", "Coupon applied successfully."),
            "cart": cart_info,
            "status": session_record.status
        }
    except (HTTPException, SwiggyAuthError, SwiggyMCPError):
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Coupon application failed: {str(e)}")


class OrderFeedbackSchema(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    filling: Optional[str] = None
    spicy: Optional[str] = None
    again: bool = True

@router.post("/session/{session_id}/feedback")
def submit_order_feedback(
    session_id: str,
    feedback_data: OrderFeedbackSchema,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Submits user feedback for a completed order session, updating user memory constraints.
    """
    # 1. Fetch OrderSession and verify ownership
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    # 2. Verify status is ORDER_PLACED
    if session_record.status != OrderStatus.ORDER_PLACED.value:
        raise HTTPException(
            status_code=400,
            detail=f"Feedback can only be submitted for completed orders. Current status: {session_record.status}"
        )

    # 3. Check if feedback already exists for this session
    feedback_record = db.query(OrderFeedback).filter(
        OrderFeedback.order_session_id == session_id
    ).first()

    if feedback_record:
        feedback_record.rating = feedback_data.rating
        feedback_record.filling = feedback_data.filling
        feedback_record.spicy = feedback_data.spicy
        feedback_record.again = feedback_data.again
        message = "Feedback updated successfully."
    else:
        feedback_record = OrderFeedback(
            id=str(uuid.uuid4()),
            user_id=user_id,
            order_session_id=session_id,
            rating=feedback_data.rating,
            filling=feedback_data.filling,
            spicy=feedback_data.spicy,
            again=feedback_data.again
        )
        db.add(feedback_record)
        message = "Feedback submitted successfully."

    # 4. Feed back spicy/filling preference into profile
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile:
        if feedback_data.spicy == "too_spicy":
            profile.spice_tolerance = "low"
            dislikes_list = list(profile.dislikes or [])
            if "spicy" not in dislikes_list:
                dislikes_list.append("spicy")
                profile.dislikes = dislikes_list
        elif feedback_data.spicy == "not_spicy":
            profile.spice_tolerance = "high"

    db.commit()
    return {"success": True, "message": message}
