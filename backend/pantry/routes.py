import secrets
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.auth.sessions import get_current_user_id
from backend.pantry.models import PantryItem
from backend.pantry.templates import KITCHEN_TEMPLATE, get_category_default_expiry_days
from backend.household.service import get_or_create_user_household
from backend.household.intelligence import RECIPE_TEMPLATES, _classify_item

router = APIRouter(prefix="/pantry", tags=["Pantry Management"])


# ── Pydantic Schemas ────────────────────────────────

VALID_STOCK_LEVELS = {"full", "half", "low", "empty"}

class PantryItemResponse(BaseModel):
    id: str
    household_id: str
    item_name: str
    stock_level: str
    category: str
    expiry_date: Optional[datetime.date] = None
    added_at: datetime.datetime
    is_bulk: bool
    bulk_use_count: int
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class PantryItemCreateRequest(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=100)
    stock_level: str = Field("full")
    category: Optional[str] = None  # auto-classified if not provided
    expiry_date: Optional[datetime.date] = None
    is_bulk: bool = False


class QuickStockItem(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=100)
    stock_level: str = Field("full")
    category: Optional[str] = None
    is_bulk: bool = False


class QuickStockRequest(BaseModel):
    items: List[QuickStockItem]


class MarkPurchasedRequest(BaseModel):
    item_ids: List[str]


# ── Helpers ─────────────────────────────────────────

def _auto_expiry(category: str) -> Optional[datetime.date]:
    """Compute a default expiry date for perishable categories."""
    days = get_category_default_expiry_days(category)
    if days is not None:
        return (datetime.datetime.utcnow() + datetime.timedelta(days=days)).date()
    return None


def _decrement_level(current: str) -> str:
    """Drop stock level by one tier."""
    order = {"full": "half", "half": "low", "low": "empty", "empty": "empty"}
    return order.get(current, "empty")


def _increment_level(current: str) -> str:
    """Raise stock level by one tier (for undo)."""
    order = {"empty": "low", "low": "half", "half": "full", "full": "full"}
    return order.get(current, "full")


# ── CRUD Endpoints ──────────────────────────────────

@router.get("", response_model=List[PantryItemResponse])
async def list_pantry_items(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """List all pantry items for the user's household."""
    household = get_or_create_user_household(db, user_id)
    items = db.query(PantryItem).filter(PantryItem.household_id == household.id).all()
    return items


@router.post("", response_model=PantryItemResponse)
async def add_or_update_pantry_item(
    req: PantryItemCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Adds a new item or updates an existing item if name matches (case-insensitive)."""
    if req.stock_level not in VALID_STOCK_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid stock_level. Must be one of: {VALID_STOCK_LEVELS}")

    household = get_or_create_user_household(db, user_id)
    category = req.category or _classify_item(req.item_name)

    # Check for existing item
    existing_item = db.query(PantryItem).filter(
        PantryItem.household_id == household.id,
        PantryItem.item_name.ilike(req.item_name)
    ).first()

    if existing_item:
        existing_item.stock_level = req.stock_level
        existing_item.category = category
        existing_item.is_bulk = req.is_bulk
        if req.expiry_date:
            existing_item.expiry_date = req.expiry_date
        db.commit()
        db.refresh(existing_item)
        return existing_item

    # Create new item
    item_id = f"pantry_{secrets.token_hex(4)}"
    expiry = req.expiry_date or _auto_expiry(category)
    new_item = PantryItem(
        id=item_id,
        household_id=household.id,
        item_name=req.item_name,
        stock_level=req.stock_level,
        category=category,
        expiry_date=expiry,
        is_bulk=req.is_bulk,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


@router.delete("/{item_id}")
async def delete_pantry_item(
    item_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Deletes an item from the pantry."""
    household = get_or_create_user_household(db, user_id)
    item = db.query(PantryItem).filter(
        PantryItem.id == item_id,
        PantryItem.household_id == household.id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Pantry item not found or access denied.")

    db.delete(item)
    db.commit()
    return {"success": True, "message": "Pantry item deleted successfully."}


# ── Quick-Stock Onboarding ──────────────────────────

@router.post("/quick-stock")
async def quick_stock_pantry(
    req: QuickStockRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Batch-add items from the kitchen template.
    Skips items that already exist. All new items default to the provided stock_level.
    """
    household = get_or_create_user_household(db, user_id)

    # Get existing item names for dedup
    existing = db.query(PantryItem).filter(PantryItem.household_id == household.id).all()
    existing_names = {item.item_name.lower().strip() for item in existing}

    added = []
    skipped = []

    for item in req.items:
        clean_name = item.item_name.strip()
        if clean_name.lower() in existing_names:
            skipped.append(clean_name)
            continue

        category = item.category or _classify_item(clean_name)
        stock_level = item.stock_level if item.stock_level in VALID_STOCK_LEVELS else "full"
        expiry = _auto_expiry(category) if stock_level != "empty" else None

        item_id = f"pantry_{secrets.token_hex(4)}"
        new_item = PantryItem(
            id=item_id,
            household_id=household.id,
            item_name=clean_name,
            stock_level=stock_level,
            category=category,
            expiry_date=expiry,
            is_bulk=item.is_bulk,
        )
        db.add(new_item)
        added.append(clean_name)
        existing_names.add(clean_name.lower())

    if added:
        db.commit()

    return {
        "success": True,
        "added_count": len(added),
        "added_items": added,
        "skipped_count": len(skipped),
        "skipped_items": skipped,
    }


@router.get("/template")
async def get_kitchen_template():
    """Returns the pre-populated kitchen template for onboarding UI."""
    return {"template": KITCHEN_TEMPLATE}


# ── Cook Auto-Decrement ─────────────────────────────

@router.post("/cook/{recipe_name}")
async def cook_recipe(
    recipe_name: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Auto-decrement pantry items after cooking a recipe.
    Bulk items only decrement every 3rd cook-cycle.
    """
    household = get_or_create_user_household(db, user_id)

    # Find the recipe template
    recipe = None
    for r in RECIPE_TEMPLATES:
        if r["name"].lower() == recipe_name.lower():
            recipe = r
            break

    if not recipe:
        raise HTTPException(status_code=404, detail=f"Recipe '{recipe_name}' not found in templates.")

    # Build pantry map
    pantry_items = db.query(PantryItem).filter(PantryItem.household_id == household.id).all()
    pantry_map = {pi.item_name.lower().strip(): pi for pi in pantry_items}

    decremented = []
    skipped_bulk = []

    for ing in recipe["ingredients"]:
        ing_name = ing["name"].lower().strip()
        pantry_item = pantry_map.get(ing_name)

        if not pantry_item:
            continue

        if pantry_item.stock_level == "empty":
            continue

        before = pantry_item.stock_level

        if pantry_item.is_bulk:
            pantry_item.bulk_use_count += 1
            if pantry_item.bulk_use_count % 3 == 0:
                pantry_item.stock_level = _decrement_level(pantry_item.stock_level)
                decremented.append({
                    "item": pantry_item.item_name,
                    "before": before,
                    "after": pantry_item.stock_level,
                    "bulk_cycle": pantry_item.bulk_use_count,
                })
            else:
                skipped_bulk.append({
                    "item": pantry_item.item_name,
                    "bulk_cycle": pantry_item.bulk_use_count,
                    "next_decrement_at": pantry_item.bulk_use_count + (3 - pantry_item.bulk_use_count % 3),
                })
        else:
            pantry_item.stock_level = _decrement_level(pantry_item.stock_level)
            decremented.append({
                "item": pantry_item.item_name,
                "before": before,
                "after": pantry_item.stock_level,
            })

    db.commit()

    return {
        "success": True,
        "recipe": recipe_name,
        "decremented": decremented,
        "bulk_skipped": skipped_bulk,
        "total_updated": len(decremented),
    }


# ── Expiring Items ──────────────────────────────────

@router.get("/expiring")
async def get_expiring_items(
    days: int = 3,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Returns pantry items expiring within N days.
    Uses expiry_date if set, otherwise falls back to category-based defaults from added_at.
    """
    household = get_or_create_user_household(db, user_id)
    items = db.query(PantryItem).filter(
        PantryItem.household_id == household.id,
        PantryItem.stock_level != "empty"
    ).all()

    now = datetime.datetime.utcnow()
    today = now.date()
    cutoff = today + datetime.timedelta(days=days)

    expiring = []
    for item in items:
        effective_expiry = item.expiry_date
        if not effective_expiry:
            # Fallback to category default
            default_days = get_category_default_expiry_days(item.category)
            if default_days and item.added_at:
                effective_expiry = (item.added_at + datetime.timedelta(days=default_days)).date()

        if not effective_expiry:
            continue

        if effective_expiry <= cutoff:
            days_left = (effective_expiry - today).days
            expiring.append({
                "id": item.id,
                "item_name": item.item_name,
                "category": item.category,
                "stock_level": item.stock_level,
                "expiry_date": effective_expiry.isoformat(),
                "days_left": max(days_left, 0),
                "urgency": "today" if days_left <= 0 else "tomorrow" if days_left == 1 else "soon",
            })

    expiring.sort(key=lambda x: x["days_left"])

    return {
        "expiring_items": expiring,
        "total_count": len(expiring),
    }


# ── Mark Purchased & Restock ────────────────────────

@router.post("/mark-purchased")
async def mark_purchased_and_restock(
    req: MarkPurchasedRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Marks grocery items as purchased and restocks matching pantry items to FULL.
    Resets added_at and clears/recomputes expiry_date for perishables.
    """
    from backend.grocery.models import GroceryListItem

    household = get_or_create_user_household(db, user_id)
    pantry_items = db.query(PantryItem).filter(PantryItem.household_id == household.id).all()
    pantry_map = {pi.item_name.lower().strip(): pi for pi in pantry_items}

    marked = []
    restocked = []

    for item_id in req.item_ids:
        grocery_item = db.query(GroceryListItem).filter(
            GroceryListItem.id == item_id
        ).first()

        if not grocery_item:
            continue

        grocery_item.is_purchased = True
        marked.append(grocery_item.item_name)

        # Restock matching pantry item
        clean_name = grocery_item.item_name.lower().strip()
        pantry_item = pantry_map.get(clean_name)
        if pantry_item:
            pantry_item.stock_level = "full"
            pantry_item.added_at = datetime.datetime.utcnow()
            pantry_item.bulk_use_count = 0
            # Recompute expiry for perishables
            pantry_item.expiry_date = _auto_expiry(pantry_item.category)
            restocked.append(pantry_item.item_name)

    db.commit()

    return {
        "success": True,
        "marked_purchased": marked,
        "restocked_to_full": restocked,
        "total_marked": len(marked),
        "total_restocked": len(restocked),
    }
