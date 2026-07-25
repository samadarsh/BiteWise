import secrets
import difflib
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.auth.sessions import get_current_user_id
from backend.household.models import Household, HouseholdMember
from backend.household.service import get_or_create_user_household
from backend.household.intelligence import (
    detect_low_stock,
    suggest_cookable_recipes,
    compute_nutrition_insights,
)

router = APIRouter(prefix="/household", tags=["Household Management"])

# Pydantic Schemas
class MemberResponse(BaseModel):
    id: str
    household_id: str
    user_id: Optional[str] = None
    name: str
    dietary_preference: str
    allergies: List[str]
    calorie_target: Optional[int] = None
    protein_target: Optional[int] = None

    class Config:
        from_attributes = True


class HouseholdResponse(BaseModel):
    id: str
    name: str
    members: List[MemberResponse]

    class Config:
        from_attributes = True


class MemberCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    dietary_preference: str = "any"
    allergies: List[str] = Field(default_factory=list)
    calorie_target: Optional[int] = None
    protein_target: Optional[int] = None


class MemberUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    dietary_preference: str = "any"
    allergies: List[str] = Field(default_factory=list)
    calorie_target: Optional[int] = None
    protein_target: Optional[int] = None


# Endpoints
@router.get("/my-home", response_model=HouseholdResponse)
async def get_my_household(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Fetches the user's current household, including all members.
    Auto-provisions a default household if none exists.
    """
    household = get_or_create_user_household(db, user_id)
    return household


@router.post("/members", response_model=MemberResponse)
async def add_household_member(
    req: MemberCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Adds a new family member to the user's household.
    """
    household = get_or_create_user_household(db, user_id)
    
    member_id = f"member_{secrets.token_hex(4)}"
    new_member = HouseholdMember(
        id=member_id,
        household_id=household.id,
        name=req.name,
        dietary_preference=req.dietary_preference,
        allergies=req.allergies,
        calorie_target=req.calorie_target,
        protein_target=req.protein_target
    )
    
    db.add(new_member)
    db.commit()
    db.refresh(new_member)
    return new_member


@router.put("/members/{member_id}", response_model=MemberResponse)
async def update_household_member(
    member_id: str,
    req: MemberUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Updates an existing family member's details.
    Enforces membership scoping.
    """
    household = get_or_create_user_household(db, user_id)
    
    member = db.query(HouseholdMember).filter(
        HouseholdMember.id == member_id,
        HouseholdMember.household_id == household.id
    ).first()
    
    if not member:
        raise HTTPException(status_code=404, detail="Household member not found or access denied.")
        
    member.name = req.name
    member.dietary_preference = req.dietary_preference
    member.allergies = req.allergies
    member.calorie_target = req.calorie_target
    member.protein_target = req.protein_target
    
    db.commit()
    db.refresh(member)
    return member


@router.delete("/members/{member_id}")
async def delete_household_member(
    member_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Removes a member from the user's household.
    Enforces membership scoping.
    """
    household = get_or_create_user_household(db, user_id)
    
    member = db.query(HouseholdMember).filter(
        HouseholdMember.id == member_id,
        HouseholdMember.household_id == household.id
    ).first()
    
    if not member:
        raise HTTPException(status_code=404, detail="Household member not found or access denied.")
        
    if member.user_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete the primary user member.")
        
    db.delete(member)
    db.commit()
    return {"success": True, "message": "Household member removed successfully."}


# ── Sprint 11: Intelligence Endpoints ──────────────────

@router.get("/low-stock")
async def get_low_stock_alerts(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Scans pantry for items below their restock threshold.
    Auto-adds out-of-stock items to the grocery list.
    """
    household = get_or_create_user_household(db, user_id)
    return detect_low_stock(db, household.id, auto_add_to_grocery=True)


@router.get("/cook-today")
async def get_cook_today_suggestions(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Returns recipe suggestions ranked by pantry coverage,
    filtered by household dietary constraints.
    """
    household = get_or_create_user_household(db, user_id)
    return suggest_cookable_recipes(db, household.id)


@router.get("/insights")
async def get_household_insights(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Aggregated nutrition targets, dietary preferences,
    allergen constraints, and conflict detection for the household.
    """
    household = get_or_create_user_household(db, user_id)
    return compute_nutrition_insights(db, household.id)


# ── Kitchen composer: thin intent router for the SmartPantry home ──────

class KitchenResolveRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=200)


@router.post("/kitchen/resolve")
async def resolve_kitchen_query(
    req: KitchenResolveRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    Resolves a free-text Kitchen composer query into one of three intents:
    - "recipe": query names a dish the household can consider cooking.
    - "browse": cooking-flavored query with no specific dish matched.
    - "grocery_item": a plain shopping list (e.g. "chips, coke, toilet paper").

    Reuses suggest_cookable_recipes for all coverage data rather than
    recomputing pantry-match logic.
    """
    household = get_or_create_user_household(db, user_id)
    query = req.query.strip()
    query_lower = query.lower()

    cook_today = suggest_cookable_recipes(db, household.id)
    suggestions = cook_today.get("suggestions", [])
    skipped = cook_today.get("skipped_recipes", [])
    recipe_names = [s["name"] for s in suggestions]
    skipped_names = [s["recipe"] for s in skipped]

    def _find(names: List[str]) -> Optional[str]:
        direct = next((name for name in names if name.lower() in query_lower), None)
        if direct:
            return direct
        close = difflib.get_close_matches(query_lower, [n.lower() for n in names], n=1, cutoff=0.6)
        if close:
            return next(n for n in names if n.lower() == close[0])
        return None

    # 1. Try to resolve to a specific dish the household can actually consider.
    matched_name = _find(recipe_names)
    if matched_name:
        recipe = next(s for s in suggestions if s["name"] == matched_name)
        return {"intent": "recipe", "recipe": recipe, "grocery_item_names": None, "browse_suggestions": None}

    # 1b. Named a real dish, but it's filtered out for this household — say why,
    # rather than silently falling through to unrelated browse suggestions.
    conflict_name = _find(skipped_names)
    if conflict_name:
        reason = next(s["reason"] for s in skipped if s["recipe"] == conflict_name)
        return {
            "intent": "recipe_conflict",
            "recipe": {"name": conflict_name, "reason": reason},
            "grocery_item_names": None,
            "browse_suggestions": None,
        }

    # 2. Cooking-flavored language with no specific dish matched -> browse fallback.
    cook_cues = ["cook", "make", "dinner", "lunch", "breakfast", "tonight", "recipe", "eat", "meal", "surprise", "quick", "veg"]
    if not query_lower or any(cue in query_lower for cue in cook_cues):
        top = sorted(suggestions, key=lambda s: s.get("coverage_pct", 0), reverse=True)[:5]
        return {"intent": "browse", "recipe": None, "grocery_item_names": None, "browse_suggestions": top}

    # 3. Otherwise treat it as a direct shopping intent.
    raw_items = [p.strip() for p in query.replace(" and ", ",").split(",")]
    item_names = [p for p in raw_items if p]
    return {"intent": "grocery_item", "recipe": None, "grocery_item_names": item_names, "browse_suggestions": None}
