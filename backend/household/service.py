import secrets
from sqlalchemy.orm import Session
from backend.household.models import Household, HouseholdMember

def get_or_create_user_household(db: Session, user_id: str) -> Household:
    """
    Retrieves the household that the user belongs to.
    If the user has no household, creates a default one and registers the user as a member.
    """
    # Look for a HouseholdMember entry mapping user_id to a household
    member = db.query(HouseholdMember).filter(HouseholdMember.user_id == user_id).first()
    
    if member:
        # Return the existing household
        household = db.query(Household).filter(Household.id == member.household_id).first()
        if household:
            return household

    # If none found, create a new household
    household_id = f"household_{secrets.token_hex(4)}"
    household = Household(
        id=household_id,
        name="My Home"
    )
    db.add(household)

    # Add the primary user as the first household member
    member_id = f"member_{secrets.token_hex(4)}"
    primary_member = HouseholdMember(
        id=member_id,
        household_id=household_id,
        user_id=user_id,
        name="Primary User",
        dietary_preference="any",
        allergies=[]
    )
    db.add(primary_member)
    db.commit()

    return household
