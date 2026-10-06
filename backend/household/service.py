import secrets
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from backend.household.models import Household, HouseholdMember


def _existing_household(db: Session, user_id: str):
    member = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user_id)
        .order_by(HouseholdMember.created_at)
        .first()
    )
    if member:
        return db.query(Household).filter(Household.id == member.household_id).first()
    return None


def get_or_create_user_household(db: Session, user_id: str) -> Household:
    """
    Retrieves the household that the user belongs to.
    If the user has no household, creates a default one and registers the user as a member.

    Safe under concurrent requests: household_members.user_id is unique, so
    when two first-load requests race (the SmartPantry page fetches
    household, pantry and grocery list in parallel), the loser's insert fails
    and it reads the winner's household instead of creating a second one
    that splits the user's pantry and lists.
    """
    household = _existing_household(db, user_id)
    if household:
        return household

    household = Household(id=f"household_{secrets.token_hex(4)}", name="My Home")
    db.add(household)
    db.add(HouseholdMember(
        id=f"member_{secrets.token_hex(4)}",
        household_id=household.id,
        user_id=user_id,
        name="Primary User",
        dietary_preference="any",
        allergies=[]
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        household = _existing_household(db, user_id)
        if household is None:
            raise
    return household
