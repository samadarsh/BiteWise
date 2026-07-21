import secrets
import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.auth.sessions import get_current_user_id
from backend.grocery.models import GroceryList, GroceryListItem, RecipePlan, InstamartCartSession
from backend.pantry.models import PantryItem
from backend.household.service import get_or_create_user_household
from backend.household.intelligence import group_grocery_items

router = APIRouter(prefix="/grocery-list", tags=["Grocery List Management"])

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
async def get_grocery_list(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Retrieves the household's active grocery list.
    """
    household = get_or_create_user_household(db, user_id)
    return get_or_create_active_list(db, household.id)


@router.post("/items", response_model=GroceryListItemResponse)
async def add_grocery_item(
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
async def update_grocery_item(
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
async def delete_grocery_item(
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
async def match_recipe_ingredients(
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


# Mock product data matching Instamart search results
MOCK_PRODUCTS = {
    "milk": {"name": "Nandini Fresh Milk 1L", "price": 46.0},
    "eggs": {"name": "Eggoz White Eggs 6pcs", "price": 55.0},
    "egg": {"name": "Eggoz White Eggs 6pcs", "price": 55.0},
    "rice": {"name": "India Gate Basmati Rice 1kg", "price": 110.0},
    "chicken": {"name": "Fresh Chicken Breast Boneless 500g", "price": 220.0},
    "lemon": {"name": "Fresh Lemon 4pcs", "price": 20.0},
    "lemons": {"name": "Fresh Lemon 4pcs", "price": 20.0},
    "yogurt": {"name": "Epigamia Greek Yogurt Blueberries 90g", "price": 60.0},
    "curd": {"name": "Amul Masti Dahi 400g", "price": 35.0},
    "spinach": {"name": "Fresh Palak (Spinach) 250g", "price": 18.0},
    "tomato": {"name": "Hybrid Tomato 500g", "price": 25.0},
    "tomatoes": {"name": "Hybrid Tomato 500g", "price": 25.0},
    "onion": {"name": "Fresh Onion 1kg", "price": 40.0},
    "onions": {"name": "Fresh Onion 1kg", "price": 40.0},
    "bread": {"name": "Britannia Whole Wheat Bread 400g", "price": 50.0},
    "butter": {"name": "Amul Butter 100g", "price": 58.0},
}

@router.post("/cart-preview", response_model=CartPreviewResponse)
async def generate_cart_preview(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Builds a simulated Instamart cart preview based on unpurchased grocery list items.
    """
    household = get_or_create_user_household(db, user_id)
    active_list = get_or_create_active_list(db, household.id)
    
    unpurchased_items = db.query(GroceryListItem).filter(
        GroceryListItem.grocery_list_id == active_list.id,
        GroceryListItem.is_purchased == False
    ).all()
    
    preview_items = []
    total_cost = 0.0
    
    for item in unpurchased_items:
        clean_name = item.item_name.lower().strip()
        
        # Try to find a matching product
        matched = None
        for key, prod in MOCK_PRODUCTS.items():
            if key in clean_name or clean_name in key:
                matched = prod
                break
                
        if matched:
            matched_name = matched["name"]
            price = matched["price"]
            status = "IN_STOCK"
        else:
            # Fallback mock item
            matched_name = f"Standard {item.item_name} Pack"
            price = 50.0 # default estimated price
            status = "SIMULATED"
            
        item_total = price * item.quantity
        total_cost += item_total
        
        preview_items.append(CartPreviewItem(
            item_name=item.item_name,
            quantity=item.quantity,
            unit=item.unit,
            matched_product_name=matched_name,
            price_in_rupees=item_total,
            stock_status=status
        ))
        
    return CartPreviewResponse(
        items=preview_items,
        total_items_count=len(preview_items),
        total_estimated_cost_rupees=total_cost
    )


@router.get("/grouped")
async def get_grouped_grocery_list(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Groups unpurchased grocery items by category (Dairy, Staples, etc.)
    with priority scoring based on pantry low-stock and staleness.
    """
    household = get_or_create_user_household(db, user_id)
    return group_grocery_items(db, household.id)
