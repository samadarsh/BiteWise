import json
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from backend.auth.sessions import get_current_user_id
from backend.db.session import get_db
from backend.db.models import UserProfile
from backend.users.models import UserProfileSchema, AddressSchema
from backend.mcp.swiggy_client import ProductionSwiggyClient
from mcp.mcp_client import SwiggyAuthError, SwiggyMCPError

router = APIRouter(prefix="/me", tags=["User Profile"])

def parse_json_field(val) -> list:
    if not val:
        return []
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return [val]
    return list(val)

def parse_dict_field(val) -> dict:
    if not val:
        return {}
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return {}
    return dict(val)

def _in_range(value, low, high):
    return value if value is not None and low <= value <= high else None

@router.get("/profile", response_model=UserProfileSchema)
def get_user_profile(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Any:
    """
    Retrieves the authenticated user's long-term fitness and nutritional preferences profile.
    """
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        # Provision a default profile
        profile = UserProfile(
            user_id=user_id,
            protein_target=35,
            calorie_target=650,
            diet_preference="any",
            allergies=[],
            dislikes=[],
            favorite_cuisines=["indian"],
            fitness_goal="maintenance",
            age=None,
            gender=None,
            height_cm=None,
            weight_kg=None,
            activity_level="moderate",
            meal_budget_default=300,
            preferred_meal_times={},
            spice_tolerance="medium",
            priority_weights={}
        )
        db.add(profile)
        try:
            db.commit()
            db.refresh(profile)
        except IntegrityError:
            # A concurrent request provisioned it first; use that row.
            db.rollback()
            profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()

    return UserProfileSchema(
        protein_target=profile.protein_target,
        calorie_target=profile.calorie_target,
        diet_preference=profile.diet_preference,
        allergies=parse_json_field(profile.allergies),
        dislikes=parse_json_field(profile.dislikes),
        favorite_cuisines=parse_json_field(profile.favorite_cuisines),
        fitness_goal=profile.fitness_goal,
        # Rows saved before the weight-log bounds were aligned with this
        # schema can hold out-of-range values; drop them instead of failing
        # validation (which made this endpoint 500 for that user forever).
        age=_in_range(profile.age, 10, 120),
        gender=profile.gender,
        height_cm=_in_range(profile.height_cm, 50.0, 250.0),
        weight_kg=_in_range(profile.weight_kg, 30.0, 250.0),
        activity_level=profile.activity_level or "moderate",
        meal_budget_default=profile.meal_budget_default or 300,
        preferred_meal_times=parse_dict_field(profile.preferred_meal_times),
        spice_tolerance=profile.spice_tolerance or "medium",
        priority_weights=parse_dict_field(profile.priority_weights)
    )

@router.put("/profile", response_model=Dict[str, str])
def update_user_profile(
    profile_data: UserProfileSchema,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> Any:
    """
    Updates the authenticated user's long-term profile targets, allergies, and dislikes.
    """
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
        
    profile.protein_target = profile_data.protein_target
    profile.calorie_target = profile_data.calorie_target
    profile.diet_preference = profile_data.diet_preference
    profile.allergies = profile_data.allergies
    profile.dislikes = profile_data.dislikes
    profile.favorite_cuisines = profile_data.favorite_cuisines
    profile.fitness_goal = profile_data.fitness_goal
    
    # Biometric updates
    profile.age = profile_data.age
    profile.gender = profile_data.gender
    profile.height_cm = profile_data.height_cm
    profile.weight_kg = profile_data.weight_kg
    profile.activity_level = profile_data.activity_level
    profile.meal_budget_default = profile_data.meal_budget_default
    profile.preferred_meal_times = profile_data.preferred_meal_times
    profile.spice_tolerance = profile_data.spice_tolerance
    profile.priority_weights = profile_data.priority_weights

    db.commit()
    return {"message": "Profile updated successfully."}

@router.get("/addresses", response_model=List[AddressSchema])
def get_user_addresses(
    user_id: str = Depends(get_current_user_id)
) -> Any:
    """
    Retrieves the user's saved delivery addresses from Swiggy.
    """
    try:
        swiggy = ProductionSwiggyClient(user_id=user_id)
        addresses = swiggy.get_addresses()
        
        return [
            AddressSchema(
                id=addr.get("id", "addr_unknown"),
                # Confirmed against a real Swiggy response: addresses carry
                # addressTag (user's own label, e.g. "Home"/"Hospital") and
                # addressCategory (coarser bucket), plus addressLine — not
                # the generic label/display_text/text keys this originally
                # assumed (those were never validated against a real payload).
                label=addr.get("addressTag") or addr.get("addressCategory") or addr.get("label") or "Address",
                display_text=addr.get("addressLine") or addr.get("display_text") or addr.get("text") or "Saved Address"
            ) for addr in addresses
        ]
    except (SwiggyAuthError, SwiggyMCPError):
        # Let it reach main.py's global handler — a clean 401
        # swiggy_reauth_required (never-connected or expired, same signal)
        # instead of being flattened into a generic 500 below.
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve saved delivery addresses: {str(e)}")
