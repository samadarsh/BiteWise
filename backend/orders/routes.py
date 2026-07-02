from typing import Dict, Any, Optional
import time
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.auth.sessions import get_current_user_id
from backend.auth.rate_limiter import mutating_rate_limiter
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.db.models import OrderSession
from backend.orders.state_machine import OrderStatus, validate_state_transition, transition_session_status

router = APIRouter(prefix="/orders", tags=["Order Sessions"])

@router.post("/session/start")
async def start_order_session(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Spawns a new order session and sets initial state to START.
    """
    import secrets
    session_id = f"session_{secrets.token_hex(6)}"
    new_session = OrderSession(
        id=session_id,
        user_id=user_id,
        status=OrderStatus.START.value
    )
    db.add(new_session)
    db.commit()
    return {
        "session_id": session_id,
        "status": OrderStatus.START.value
    }

@router.post("/session/{session_id}/select-address")
async def select_address(
    session_id: str,
    address_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Binds the user-selected addressId to the current order session.
    """
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    session_record.address_id = address_id
    transition_session_status(db, session_record, OrderStatus.ADDRESS_SELECTED)

    return {
        "session_id": session_id,
        "address_id": address_id,
        "status": OrderStatus.ADDRESS_SELECTED.value
    }

@router.post("/session/{session_id}/select-item")
async def select_item(
    session_id: str,
    restaurant_id: str = Query(..., description="ID of the selected restaurant"),
    item_id: str = Query(..., description="ID of the selected menu item"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Selects a specific meal item for the order session, transitioning status to ITEM_SELECTED.
    """
    session_record = db.query(OrderSession).filter(
        OrderSession.id == session_id,
        OrderSession.user_id == user_id
    ).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Order session not found.")

    session_record.selected_restaurant_id = restaurant_id
    session_record.selected_item_id = item_id
    transition_session_status(db, session_record, OrderStatus.ITEM_SELECTED)

    return {
        "session_id": session_id,
        "restaurant_id": restaurant_id,
        "item_id": item_id,
        "status": OrderStatus.ITEM_SELECTED.value
    }

@router.post("/session/{session_id}/cart")
async def sync_cart(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter)
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
        # Update cart
        client.update_food_cart(
            addressId=address_id,
            restaurantId=session_record.selected_restaurant_id,
            cartItems=[{"itemId": session_record.selected_item_id, "quantity": 1}]
        )

        # Fetch updated cart
        cart_info = client.get_food_cart(addressId=address_id)

        # Save snapshot and transition
        session_record.cart_snapshot = cart_info
        session_record.total = cart_info.get("bill", {}).get("total", 0) or cart_info.get("total", 0) or 0
        transition_session_status(db, session_record, OrderStatus.CART_UPDATED)
        db.commit()

        return {
            "session_id": session_id,
            "cart": cart_info,
            "status": OrderStatus.CART_UPDATED.value
        }
    except Exception as e:
        transition_session_status(db, session_record, OrderStatus.FAILED)
        raise HTTPException(status_code=500, detail=f"Cart sync failed: {str(e)}")

@router.get("/session/{session_id}/cart")
async def review_cart(
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
        session_record.total = cart_info.get("bill", {}).get("total", 0) or cart_info.get("total", 0) or 0
        transition_session_status(db, session_record, OrderStatus.CART_REVIEW_READY)
        db.commit()

        return {
            "session_id": session_id,
            "cart": cart_info,
            "status": OrderStatus.CART_REVIEW_READY.value
        }
    except Exception as e:
        transition_session_status(db, session_record, OrderStatus.FAILED)
        raise HTTPException(status_code=500, detail=f"Cart review failed: {str(e)}")

@router.post("/session/{session_id}/confirm")
async def confirm_order_details(
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
async def place_order(
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
        cart_total = cart_info.get("bill", {}).get("total", 0) or cart_info.get("total", 0) or 0
        if cart_total >= 1000:
            transition_session_status(db, session_record, OrderStatus.FAILED)
            raise HTTPException(
                status_code=400,
                detail=f"Checkout blocked: Cart total of Rs {cart_total} exceeds the Swiggy Builders Club cap of Rs 1000."
            )

        # 5. Execute placing safely using resilience layer checkout recovery policy
        from agent.resilience import place_order_safely

        def do_place():
            return client.place_food_order(addressId=address_id, paymentMethod="COD")

        def do_check():
            return client.get_food_orders(addressId=address_id)

        res = place_order_safely(place_order_fn=do_place, check_status_fn=do_check)
        if not res.get("success"):
            transition_session_status(db, session_record, OrderStatus.FAILED)
            status_code = 409 if res.get("already_placed") else 500
            error_detail = res.get("message", "Order placement failed.")
            if res.get("already_placed"):
                error_detail = f"Checkout blocked: A recent order was already placed. Duplicate prevention active. Detail: {error_detail}"
            raise HTTPException(status_code=status_code, detail=error_detail)

        # Transition status to ORDER_PLACED
        transition_session_status(db, session_record, OrderStatus.ORDER_PLACED)

        # Record final details
        session_record.selected_restaurant_id = cart_info.get("restaurantId") or session_record.selected_restaurant_id
        session_record.total = cart_total
        session_record.payment_method = "COD"
        db.commit()

        return {
            "success": True,
            "order_id": res.get("order_id"),
            "status": OrderStatus.ORDER_PLACED.value,
            "message": res.get("message")
        }

    except HTTPException:
        raise
    except Exception as e:
        # Failsafe: transition session to FAILED in case of other errors
        transition_session_status(db, session_record, OrderStatus.FAILED)
        raise HTTPException(status_code=500, detail=f"Order placement failed: {str(e)}")



from pydantic import BaseModel, Field
import uuid
from backend.db.models import OrderFeedback, UserProfile

class ApplyCouponSchema(BaseModel):
    coupon_code: str = Field(..., min_length=1)

@router.get("/session/{session_id}/coupons")
async def get_applicable_coupons(
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch coupons: {str(e)}")

@router.post("/session/{session_id}/coupon/apply")
async def apply_coupon_to_cart(
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
        session_record.total = cart_info.get("bill", {}).get("total", 0) or cart_info.get("total", 0) or 0
        db.commit()

        return {
            "success": True,
            "message": apply_res.get("message", "Coupon applied successfully."),
            "cart": cart_info,
            "status": session_record.status
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Coupon application failed: {str(e)}")


class OrderFeedbackSchema(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    filling: Optional[str] = None
    spicy: Optional[str] = None
    again: bool = True

@router.post("/session/{session_id}/feedback")
async def submit_order_feedback(
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
