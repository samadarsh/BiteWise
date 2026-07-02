import json
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.auth.sessions import get_current_user_id
from backend.db.session import get_db
from backend.db.models import UserProfile
from backend.users.models import UserProfileSchema, AddressSchema
from backend.mcp.swiggy_client import ProductionSwiggyClient

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

@router.get("/profile", response_model=UserProfileSchema)
async def get_user_profile(
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
            fitness_goal="maintenance"
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return UserProfileSchema(
        protein_target=profile.protein_target,
        calorie_target=profile.calorie_target,
        diet_preference=profile.diet_preference,
        allergies=parse_json_field(profile.allergies),
        dislikes=parse_json_field(profile.dislikes),
        favorite_cuisines=parse_json_field(profile.favorite_cuisines),
        fitness_goal=profile.fitness_goal
    )

@router.put("/profile", response_model=Dict[str, str])
async def update_user_profile(
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
    
    db.commit()
    return {"message": "Profile updated successfully."}

@router.get("/addresses", response_model=List[AddressSchema])
async def get_user_addresses(
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
                label=addr.get("label", "Address"),
                display_text=addr.get("display_text") or addr.get("text") or "Saved Address"
            ) for addr in addresses
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve saved delivery addresses: {str(e)}")
