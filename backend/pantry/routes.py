import secrets
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.auth.sessions import get_current_user_id
from backend.pantry.models import PantryItem
from backend.household.service import get_or_create_user_household

router = APIRouter(prefix="/pantry", tags=["Pantry Management"])

# Pydantic Schemas
class PantryItemResponse(BaseModel):
    id: str
    household_id: str
    item_name: str
    quantity: float
    unit: str
    min_threshold: Optional[float] = None
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class PantryItemCreateRequest(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=100)
    quantity: float = Field(..., ge=0)
    unit: str = Field("unit", min_length=1, max_length=20)
    min_threshold: Optional[float] = Field(None, ge=0)


# Endpoints
@router.get("", response_model=List[PantryItemResponse])
async def list_pantry_items(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    List all pantry items for the user's household.
    """
    household = get_or_create_user_household(db, user_id)
    items = db.query(PantryItem).filter(PantryItem.household_id == household.id).all()
    return items


@router.post("", response_model=PantryItemResponse)
async def add_or_update_pantry_item(
    req: PantryItemCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Adds a new item or updates an existing item if name matches (case-insensitive).
    """
    household = get_or_create_user_household(db, user_id)
    
    # Check for existing item with same name (case-insensitive) in this household
    existing_item = db.query(PantryItem).filter(
        PantryItem.household_id == household.id,
        PantryItem.item_name.ilike(req.item_name)
    ).first()
    
    if existing_item:
        existing_item.quantity = req.quantity
        existing_item.unit = req.unit
        existing_item.min_threshold = req.min_threshold
        db.commit()
        db.refresh(existing_item)
        return existing_item
        
    # Create new item
    item_id = f"pantry_{secrets.token_hex(4)}"
    new_item = PantryItem(
        id=item_id,
        household_id=household.id,
        item_name=req.item_name,
        quantity=req.quantity,
        unit=req.unit,
        min_threshold=req.min_threshold
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
    """
    Deletes an item from the pantry.
    """
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
