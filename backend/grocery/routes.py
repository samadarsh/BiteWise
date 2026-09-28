import math
import secrets
import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.auth.sessions import get_current_user_id
from backend.auth.rate_limiter import mutating_rate_limiter
from backend.grocery.models import GroceryList, GroceryListItem, RecipePlan, InstamartCartSession
from backend.pantry.models import PantryItem
from backend.pantry.routes import mark_grocery_items_purchased_and_restock
from backend.household.service import get_or_create_user_household
from backend.household.intelligence import group_grocery_items
from backend.mcp.swiggy_instamart_client import ProductionSwiggyInstamartClient
from mcp.instamart_mock import MockSwiggyInstamartMCP
from mcp.mcp_client import SwiggyAuthError, SwiggyMCPError
from config.settings import get_settings
from backend.orders.state_machine import utc_now_naive

router = APIRouter(prefix="/grocery-list", tags=["Grocery List Management"])

INSTAMART_MIN_ORDER_RUPEES = 99
INSTAMART_MAX_ORDER_RUPEES = 1000
RECENT_CHECKOUT_WINDOW_SECONDS = 60

# Common English/Hindi synonyms and plurals that don't substring-match the
# catalog's product names directly (e.g. "curd" -> "Amul Masti Dahi 400g").
_CATALOG_ALIASES = {"curd": "dahi", "eggs": "egg", "tomatoes": "tomato", "onions": "onion", "lemons": "lemon"}

# Pydantic Schemas
class GroceryListItemResponse(BaseModel):
    id: str
    grocery_list_id: str
    item_name: str
    quantity: float
    unit: str
    is_purchased: bool
    added_at: datetime.datetime

    class Config:
        from_attributes = True


class GroceryListResponse(BaseModel):
    id: str
    household_id: str
    name: str
    items: List[GroceryListItemResponse]

    class Config:
        from_attributes = True


class ItemCreateRequest(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=100)
    quantity: float = Field(1.0, ge=0.01)
    unit: str = Field("unit", min_length=1, max_length=20)


class ItemUpdateRequest(BaseModel):
    is_purchased: bool


class RecipePlanIngredient(BaseModel):
    name: str
    qty: float
    unit: str


class RecipePlanRequest(BaseModel):
    recipe_name: str
    ingredients: List[RecipePlanIngredient]
    planned_for_date: datetime.date


class CartPreviewItem(BaseModel):
    item_name: str
    quantity: float
    unit: str
    matched_product_name: str
    price_in_rupees: float
    stock_status: str


class CartPreviewResponse(BaseModel):
    items: List[CartPreviewItem]
    total_items_count: int
    total_estimated_cost_rupees: float


# Helper
def get_or_create_active_list(db: Session, household_id: str) -> GroceryList:
    active_list = db.query(GroceryList).filter(GroceryList.household_id == household_id).first()
    if not active_list:
        list_id = f"list_{secrets.token_hex(4)}"
        active_list = GroceryList(
            id=list_id,
            household_id=household_id,
            name="Shopping List"
        )
        db.add(active_list)
        db.commit()
        db.refresh(active_list)
    return active_list


# Endpoints
@router.get("", response_model=GroceryListResponse)
def get_grocery_list(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Retrieves the household's active grocery list.
    """
    household = get_or_create_user_household(db, user_id)
    return get_or_create_active_list(db, household.id)


@router.post("/items", response_model=GroceryListItemResponse)
def add_grocery_item(
    req: ItemCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Adds a new item to the active grocery list.
    """
    household = get_or_create_user_household(db, user_id)
    active_list = get_or_create_active_list(db, household.id)
    
    # Check if item already exists on the list
    existing = db.query(GroceryListItem).filter(
        GroceryListItem.grocery_list_id == active_list.id,
        GroceryListItem.item_name.ilike(req.item_name),
        GroceryListItem.is_purchased == False
    ).first()
    
    if existing:
        existing.quantity += req.quantity
        db.commit()
        db.refresh(existing)
        return existing
        
    item_id = f"item_{secrets.token_hex(4)}"
    new_item = GroceryListItem(
        id=item_id,
        grocery_list_id=active_list.id,
        item_name=req.item_name,
        quantity=req.quantity,
        unit=req.unit,
        is_purchased=False
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


@router.put("/items/{item_id}", response_model=GroceryListItemResponse)
def update_grocery_item(
    item_id: str,
    req: ItemUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Updates the is_purchased status of a grocery list item.
    """
    household = get_or_create_user_household(db, user_id)
    active_list = get_or_create_active_list(db, household.id)
    
    item = db.query(GroceryListItem).filter(
        GroceryListItem.id == item_id,
        GroceryListItem.grocery_list_id == active_list.id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Grocery item not found or access denied.")
        
    item.is_purchased = req.is_purchased
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_grocery_item(
    item_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Removes an item from the grocery list.
    """
    household = get_or_create_user_household(db, user_id)
    active_list = get_or_create_active_list(db, household.id)
    
    item = db.query(GroceryListItem).filter(
        GroceryListItem.id == item_id,
        GroceryListItem.grocery_list_id == active_list.id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Grocery item not found or access denied.")
        
    db.delete(item)
    db.commit()
    return {"success": True, "message": "Grocery item removed from list."}


@router.post("/recipe-match")
def match_recipe_ingredients(
    req: RecipePlanRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Saves a planned recipe and compares its ingredients against current pantry stock.
    Auto-adds missing or insufficient ingredients to the grocery list.
    """
    household = get_or_create_user_household(db, user_id)
    active_list = get_or_create_active_list(db, household.id)
    
    # Save the Recipe Plan
    plan_id = f"plan_{secrets.token_hex(4)}"
    plan = RecipePlan(
        id=plan_id,
        household_id=household.id,
        recipe_name=req.recipe_name,
        ingredients=[ing.dict() for ing in req.ingredients],
        planned_for_date=req.planned_for_date
    )
    db.add(plan)
    
    # Matching Engine
    added_items = []
    available_items = []
    
    # Fetch all pantry items for comparison
    pantry_map = {}
    pantry_items = db.query(PantryItem).filter(PantryItem.household_id == household.id).all()
    for pi in pantry_items:
        pantry_map[pi.item_name.lower().strip()] = pi
        
    for ing in req.ingredients:
        name_clean = ing.name.lower().strip()
        pantry_item = pantry_map.get(name_clean)
        
        has_stock = pantry_item and pantry_item.stock_level in ("full", "half")
        
        if not has_stock:
            # Check if already in grocery list
            list_item = db.query(GroceryListItem).filter(
                GroceryListItem.grocery_list_id == active_list.id,
                GroceryListItem.item_name.ilike(ing.name),
                GroceryListItem.is_purchased == False
            ).first()
            
            if not list_item:
                # Add to grocery list
                item_id = f"item_{secrets.token_hex(4)}"
                list_item = GroceryListItem(
                    id=item_id,
                    grocery_list_id=active_list.id,
                    item_name=ing.name,
                    quantity=1.0,
                    unit="pack",
                    is_purchased=False
                )
                db.add(list_item)
                added_items.append({
                    "name": ing.name,
                    "quantity": 1.0,
                    "unit": "pack",
                    "reason": f"Stock level is '{pantry_item.stock_level if pantry_item else 'empty'}' in pantry."
                })
            else:
                added_items.append({
                    "name": ing.name,
                    "quantity": list_item.quantity,
                    "unit": list_item.unit,
                    "reason": "Already on shopping list."
                })
        else:
            available_items.append({
                "name": ing.name,
                "quantity": 1.0,
                "unit": "pack"
            })
            
    db.commit()
    
    return {
        "success": True,
        "recipe_plan_id": plan_id,
        "added_to_grocery_list": added_items,
        "available_in_pantry": available_items
    }


def _match_catalog_product_mock(item_name: str) -> Optional[Dict[str, Any]]:
    """
    Matches a free-text grocery item name against the same Instamart catalog used
    for cart/checkout (mcp.instamart_mock.MockSwiggyInstamartMCP), so the price shown
    in the preview is exactly what checkout charges — one catalog, not two.
    """
    clean = item_name.lower().strip()
    search_terms = {clean, _CATALOG_ALIASES.get(clean, clean)}
    if clean.endswith("s"):
        search_terms.add(clean[:-1])

    # Catalog is static per-instance data, not user state — any instance works as a lookup.
    catalog = MockSwiggyInstamartMCP(user_id="_catalog_lookup")._catalog
    for prod in catalog:
        prod_name_lower = prod["name"].lower()
        if any(term and term in prod_name_lower for term in search_terms):
            return prod
    return None


def _match_catalog_product_live(item_name: str, user_id: str, address_id: str) -> Optional[Dict[str, Any]]:
    """
    Real-mode counterpart to _match_catalog_product_mock — searches Swiggy's
    actual Instamart catalog instead of the local mock fixture, so real
    checkout never sends a fabricated mock spinId to a real cart/checkout
    call (confirmed live: real search_products returns
    {"displayName", "variations": [{"spinId", "price": {"offerPrice"}, ...}]},
    not the mock catalog's flat {"name", "price", "spinId"} shape — normalized
    to that same flat shape here so callers don't need to know the difference).
    """
    try:
        client = ProductionSwiggyInstamartClient(user_id=user_id)
        products = client.search_products(addressId=address_id, query=item_name)
    except SwiggyAuthError:
        # An expired/missing Swiggy session isn't "item not in catalog" —
        # treating it that way silently fell back to fake SIMULATED pricing
        # for the whole preview instead of prompting reconnect. Let it
        # propagate to main.py's global handler for a clean 401.
        raise
    except Exception:
        return None

    for prod in products:
        variations = prod.get("variations") or []
        available = next((v for v in variations if v.get("isInStockAndAvailable")), variations[0] if variations else None)
        if not available or not available.get("spinId"):
            continue
        price = (available.get("price") or {}).get("offerPrice") or (available.get("price") or {}).get("mrp")
        if price is None:
            continue
        return {
            "name": prod.get("displayName") or item_name,
            "price": float(price),
            "spinId": available["spinId"],
        }
    return None


def _match_catalog_product(item_name: str, user_id: str, address_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Only mock mode uses fixture data — real mode always searches Swiggy's
    actual catalog (or falls back to the SIMULATED estimate below if no
    address is available yet, never to fabricated mock products/prices)."""
    settings = get_settings()
    if settings.use_mock_mcp:
        return _match_catalog_product_mock(item_name)
    if not address_id:
        return None
    return _match_catalog_product_live(item_name, user_id, address_id)


def _build_cart_lines(db: Session, household_id: str, user_id: str, address_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Shared by the preview and checkout endpoints so what the user previews is
    exactly what gets ordered — same matching, same totals. address_id is
    required for real-mode catalog matching (Instamart pricing/availability
    is location-specific); without it, real mode falls back to the same
    SIMULATED estimate used for an unmatched item, never to mock data.
    """
    active_list = get_or_create_active_list(db, household_id)
    unpurchased_items = db.query(GroceryListItem).filter(
        GroceryListItem.grocery_list_id == active_list.id,
        GroceryListItem.is_purchased == False
    ).all()

    preview_items: List[CartPreviewItem] = []
    cart_items_for_mcp: List[Dict[str, Any]] = []
    unmatched_names: List[str] = []
    total_cost = 0.0

    for item in unpurchased_items:
        matched = _match_catalog_product(item.item_name, user_id, address_id)

        if matched:
            matched_name = matched["name"]
            price = matched["price"]
            status = "IN_STOCK"
            spin_id = matched["spinId"]
        else:
            matched_name = f"Standard {item.item_name} Pack"
            price = 50.0  # default estimated price
            status = "SIMULATED"
            spin_id = f"generic_{item.id}"

        # Instamart sells whole units: round up once and use the same number
        # for both the displayed price and the cart line, so the preview
        # total is exactly what gets ordered (int() used to turn 0.5 into 1
        # but 2.5 into 2, while the preview priced 2.5).
        order_qty = max(1, math.ceil(item.quantity))
        item_total = price * order_qty
        total_cost += item_total

        preview_items.append(CartPreviewItem(
            item_name=item.item_name,
            quantity=item.quantity,
            unit=item.unit,
            matched_product_name=matched_name,
            price_in_rupees=item_total,
            stock_status=status
        ))
        cart_items_for_mcp.append({"spinId": spin_id, "quantity": order_qty})
        if status == "SIMULATED":
            unmatched_names.append(item.item_name)

    return {
        "preview_items": preview_items,
        "cart_items_for_mcp": cart_items_for_mcp,
        "grocery_items": unpurchased_items,
        "total_cost": round(total_cost, 2),
        "unmatched_names": unmatched_names,
    }


@router.post("/cart-preview", response_model=CartPreviewResponse)
def generate_cart_preview(
    address_id: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Builds an Instamart cart preview based on unpurchased grocery list items —
    matched against the mock catalog in mock mode, or Swiggy's real Instamart
    catalog (needs address_id) otherwise.
    """
    household = get_or_create_user_household(db, user_id)
    lines = _build_cart_lines(db, household.id, user_id, address_id)

    return CartPreviewResponse(
        items=lines["preview_items"],
        total_items_count=len(lines["preview_items"]),
        total_estimated_cost_rupees=lines["total_cost"]
    )


class InstamartCheckoutRequest(BaseModel):
    address_id: str = Field(..., min_length=1)
    # Swiggy's Instamart checkout tool only documents "UPI" or "Cash" for
    # paymentMethod (defaults to "Cash" if omitted) — "COD" isn't a
    # recognized value there, same mismatch as the Food order flow.
    payment_method: str = Field("Cash", min_length=1)


@router.post("/checkout")
def checkout_instamart_cart(
    req: InstamartCheckoutRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter)
):
    """
    Places a real Instamart order for the household's grocery list, mirroring
    NutriOrder's Food checkout flow: build cart -> confirm -> place -> mark purchased.
    Gated the same way as Food (SWIGGY_ENV=staging + ALLOW_PLACE_ORDER=true outside
    mock mode) and capped at Rs 1000 per the Swiggy Builders Club rules.
    """
    household = get_or_create_user_household(db, user_id)
    lines = _build_cart_lines(db, household.id, user_id, req.address_id)

    if not lines["cart_items_for_mcp"]:
        raise HTTPException(status_code=400, detail="Your grocery list is empty.")

    total = lines["total_cost"]
    if total < INSTAMART_MIN_ORDER_RUPEES:
        raise HTTPException(
            status_code=400,
            detail=f"Instamart orders need a minimum of Rs {INSTAMART_MIN_ORDER_RUPEES} (current: Rs {total})."
        )
    if total >= INSTAMART_MAX_ORDER_RUPEES:
        raise HTTPException(
            status_code=400,
            detail=f"Checkout blocked: Cart total of Rs {total} exceeds the Swiggy Builders Club cap of Rs {INSTAMART_MAX_ORDER_RUPEES}."
        )

    settings = get_settings()
    is_mock = settings.use_mock_mcp
    if not is_mock and (settings.swiggy_env != "staging" or not settings.allow_place_order):
        raise HTTPException(
            status_code=403,
            detail="Safety Lock: Instamart checkout is disabled unless SWIGGY_ENV=staging and ALLOW_PLACE_ORDER=true."
        )

    # Never send a made-up product ID to a real cart: an unmatched line is
    # only a SIMULATED estimate (spinId "generic_<id>") and has no real
    # Instamart product behind it.
    if not is_mock and lines["unmatched_names"]:
        raise HTTPException(
            status_code=400,
            detail=(
                "Couldn't find these on Instamart: " + ", ".join(lines["unmatched_names"])
                + ". Rename or remove them from your grocery list, then build the cart again."
            ),
        )

    # Double-submit guard (two tabs / double click).
    recent_cutoff = utc_now_naive() - datetime.timedelta(seconds=RECENT_CHECKOUT_WINDOW_SECONDS)
    recent_checkout = db.query(InstamartCartSession).filter(
        InstamartCartSession.household_id == household.id,
        InstamartCartSession.status.in_(["PLACING", "PLACED"]),
        InstamartCartSession.updated_at >= recent_cutoff,
    ).first()
    if recent_checkout:
        raise HTTPException(
            status_code=409,
            detail="Checkout blocked: an Instamart order for your household was placed less than a minute ago. Duplicate prevention active.",
        )

    session_id = f"instamart_{secrets.token_hex(6)}"
    session_record = InstamartCartSession(id=session_id, user_id=user_id, household_id=household.id, status="START", updated_at=utc_now_naive())
    db.add(session_record)
    db.commit()

    try:
        client = ProductionSwiggyInstamartClient(user_id=user_id)
        # update_cart REPLACES the whole Instamart cart (per the docs) — the
        # UI tells the user this before they confirm.
        cart_res = client.update_cart(addressId=req.address_id, items=lines["cart_items_for_mcp"]) or {}

        if not is_mock:
            dropped = (cart_res.get("removedOutOfStockItems") or []) + (cart_res.get("unserviceableItems") or [])
            if dropped:
                names = ", ".join(str(d.get("itemName") or d.get("spinId")) for d in dropped if isinstance(d, dict))
                raise HTTPException(status_code=409, detail=f"Some items are out of stock or can't be delivered here: {names}. Update your list and try again.")
            live_total = instamart_cart_total(cart_res)
            if live_total is None:
                raise HTTPException(status_code=400, detail="Checkout blocked: couldn't read the Instamart cart total. Please try again.")
            if live_total < INSTAMART_MIN_ORDER_RUPEES:
                raise HTTPException(status_code=400, detail=f"Instamart orders need a minimum of Rs {INSTAMART_MIN_ORDER_RUPEES} (current: Rs {live_total}).")
            if live_total >= INSTAMART_MAX_ORDER_RUPEES:
                raise HTTPException(status_code=400, detail=f"Checkout blocked: Cart total of Rs {live_total} exceeds the Swiggy Builders Club cap of Rs {INSTAMART_MAX_ORDER_RUPEES}.")
            total = live_total

        session_record.status = "PLACING"
        session_record.updated_at = utc_now_naive()
        db.commit()

        order_res = client.checkout(addressId=req.address_id, paymentMethod=req.payment_method) or {}

        if str(order_res.get("status") or "").upper() == "PENDING_PAYMENT":
            session_record.status = "PENDING_PAYMENT"
            session_record.swiggy_cart_meta = order_res
            db.commit()
            raise HTTPException(status_code=402, detail="Payment is still pending — the order isn't placed yet. Complete payment in your UPI app.")

        # Multi-store carts come back as several orders (per the checkout
        # docs); only a fully successful checkout restocks the pantry.
        partial = "orders" in order_res and not order_res.get("allSucceeded", False)
        order_ids = [o.get("orderId") for o in (order_res.get("orders") or []) if isinstance(o, dict) and o.get("orderId")]
        order_id = order_res.get("orderId") or (order_ids[0] if order_ids else None)

        session_record.status = "PARTIAL" if partial else "PLACED"
        session_record.swiggy_cart_meta = order_res
        session_record.updated_at = utc_now_naive()
        db.commit()

        restocked: List[str] = []
        if not partial:
            restock_result = mark_grocery_items_purchased_and_restock(
                db, household.id, [gi.id for gi in lines["grocery_items"]]
            )
            restocked = restock_result["restocked_to_full"]

        return {
            "success": True,
            "partial": partial,
            "order_id": order_id or session_id,
            "order_ids": order_ids,
            "status": session_record.status,
            "total": total,
            "items_ordered": len(lines["cart_items_for_mcp"]),
            "restocked_to_full": restocked,
            "message": (
                "Some stores couldn't fulfil their part of this order — check your Swiggy app. Your grocery list was left unchanged."
                if partial else None
            ),
        }
    except HTTPException:
        if session_record.status in ("START", "PLACING"):
            session_record.status = "FAILED"
            db.commit()
        raise
    except (SwiggyAuthError, SwiggyMCPError):
        session_record.status = "FAILED"
        db.commit()
        raise
    except Exception as e:
        session_record.status = "FAILED"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Instamart checkout failed: {str(e)}")


def instamart_cart_total(cart: Dict[str, Any]) -> Optional[float]:
    """Payable total of a real Instamart cart (get_cart / update_cart docs:
    `billBreakdown.toPay.value`, else `cartTotalAmount` — both strings)."""
    if not isinstance(cart, dict):
        return None
    candidates = [((cart.get("billBreakdown") or {}).get("toPay") or {}).get("value"), cart.get("cartTotalAmount")]
    for value in candidates:
        if value is None:
            continue
        try:
            return float(str(value).replace("₹", "").replace(",", "").strip())
        except ValueError:
            continue
    return None


@router.get("/grouped")
def get_grouped_grocery_list(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Groups unpurchased grocery items by category (Dairy, Staples, etc.)
    with priority scoring based on pantry low-stock and staleness.
    """
    household = get_or_create_user_household(db, user_id)
    return group_grocery_items(db, household.id)
