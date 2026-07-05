import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.auth.sessions import get_current_user_id
from backend.household.models import Household, HouseholdMember
from backend.household.service import get_or_create_user_household

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
