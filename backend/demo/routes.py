import datetime
import secrets
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.auth.sessions import get_current_user_id
from backend.db.models import UserProfile, OrderSession, OrderEvent, NutritionEntry, DeliveryAddress, OrderFeedback
from backend.coach.service import get_local_today_date
from config.settings import get_settings
from mcp.mcp_mock import MockSwiggyFoodMCP
from mcp.instamart_mock import MockSwiggyInstamartMCP

# Import Sprint 10 Household/Pantry/Grocery models
from backend.household.models import Household, HouseholdMember
from backend.pantry.models import PantryItem
from backend.grocery.models import GroceryList, GroceryListItem, RecipePlan, InstamartCartSession

router = APIRouter(prefix="/demo", tags=["Demo Management"])

def enforce_demo_only():
    settings = get_settings()
    if not (settings.use_mock_mcp or settings.app_env == "development"):
        raise HTTPException(status_code=403, detail="Demo endpoints are disabled in staging/production mode.")

def safe_delete_user_household(db: Session, user_id: str):
    """Deletes only the current user's household graph in a non-invasive, FK-safe manner."""
    member = db.query(HouseholdMember).filter(HouseholdMember.user_id == user_id).first()
    if member:
        hh_id = member.household_id

        # 1. Cart Sessions
        db.query(InstamartCartSession).filter(InstamartCartSession.household_id == hh_id).delete()

        # 2. Recipe Plans
        db.query(RecipePlan).filter(RecipePlan.household_id == hh_id).delete()

        # 3. Grocery List Items
        g_lists = db.query(GroceryList).filter(GroceryList.household_id == hh_id).all()
        list_ids = [gl.id for gl in g_lists]
        if list_ids:
            db.query(GroceryListItem).filter(GroceryListItem.grocery_list_id.in_(list_ids)).delete(synchronize_session=False)
            db.query(GroceryList).filter(GroceryList.id.in_(list_ids)).delete(synchronize_session=False)

        # 4. Pantry Items
        db.query(PantryItem).filter(PantryItem.household_id == hh_id).delete()

        # 5. Members
        db.query(HouseholdMember).filter(HouseholdMember.household_id == hh_id).delete()

        # 6. Household
        db.query(Household).filter(Household.id == hh_id).delete()

@router.post("/reset")
async def reset_demo_data(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    enforce_demo_only()
    try:
        # FK-safe deletion order
        # 1. OrderFeedback
        db.query(OrderFeedback).filter(OrderFeedback.user_id == user_id).delete()

        # 2. NutritionEntry
        db.query(NutritionEntry).filter(NutritionEntry.user_id == user_id).delete()

        # 3. OrderEvent (deleting events tied to user's order sessions)
        user_sessions = db.query(OrderSession).filter(OrderSession.user_id == user_id).all()
        user_session_ids = [s.id for s in user_sessions]
        db.query(OrderEvent).filter(OrderEvent.order_session_id.in_(user_session_ids)).delete(synchronize_session=False)

        # 4. OrderSession
        db.query(OrderSession).filter(OrderSession.user_id == user_id).delete()

        # 5. DeliveryAddress
        db.query(DeliveryAddress).filter(DeliveryAddress.user_id == user_id).delete()

        # 6. Reset UserProfile
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if profile:
            profile.age = None
            profile.gender = None
            profile.height_cm = None
            profile.weight_kg = None
            profile.activity_level = "moderate"
            profile.fitness_goal = "maintenance"
            profile.protein_target = 35
            profile.calorie_target = 650
            profile.diet_preference = "any"
            profile.allergies = []
            profile.dislikes = []
            profile.favorite_cuisines = ["indian"]
            profile.meal_budget_default = 300
            profile.preferred_meal_times = {}
            profile.spice_tolerance = "medium"

        # 7. Household Deletes
        safe_delete_user_household(db, user_id)

        db.commit()

        # Wipe memory mock MCP state
        MockSwiggyFoodMCP.clear_mock_user_data(user_id)
        MockSwiggyInstamartMCP.clear_mock_user_data(user_id)

        return {"success": True, "message": "Demo data reset successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")

@router.post("/seed")
async def seed_demo_data(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    enforce_demo_only()
    try:
        # 1. Reset first in FK-safe order
        db.query(OrderFeedback).filter(OrderFeedback.user_id == user_id).delete()
        db.query(NutritionEntry).filter(NutritionEntry.user_id == user_id).delete()
        user_sessions = db.query(OrderSession).filter(OrderSession.user_id == user_id).all()
        user_session_ids = [s.id for s in user_sessions]
        db.query(OrderEvent).filter(OrderEvent.order_session_id.in_(user_session_ids)).delete(synchronize_session=False)
        db.query(OrderSession).filter(OrderSession.user_id == user_id).delete()
        db.query(DeliveryAddress).filter(DeliveryAddress.user_id == user_id).delete()

        # Reset Household graph safely
        safe_delete_user_household(db, user_id)

        # Wipe memory mock MCP state
        MockSwiggyFoodMCP.clear_mock_user_data(user_id)
        MockSwiggyInstamartMCP.clear_mock_user_data(user_id)

        # 2. Seed profile biometrics
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            profile = UserProfile(user_id=user_id)
            db.add(profile)

        profile.age = 28
        profile.gender = "male"
        profile.height_cm = 175.0
        profile.weight_kg = 75.0
        profile.activity_level = "moderate"
        profile.fitness_goal = "maintenance"
        profile.protein_target = 35
        profile.calorie_target = 650
        profile.diet_preference = "any"
        profile.allergies = []
        profile.dislikes = []
        profile.favorite_cuisines = ["indian", "italian"]
        profile.meal_budget_default = 300
        profile.preferred_meal_times = {}
        profile.spice_tolerance = "medium"

        # 3. Seed mock delivery addresses (matching mock MCP exactly)
        addr1 = DeliveryAddress(
            user_id=user_id,
            address_id="addr_home",
            label="Home",
            display_text="123 Green Glen Layout, Outer Ring Road, Bengaluru",
            last_selected_at=datetime.datetime.now() - datetime.timedelta(minutes=10)
        )
        addr2 = DeliveryAddress(
            user_id=user_id,
            address_id="addr_office",
            label="Office",
            display_text="Swiggy HQ, Devarabeesanahalli, Bengaluru",
            last_selected_at=datetime.datetime.now() - datetime.timedelta(minutes=30)
        )
        db.add(addr1)
        db.add(addr2)

        # 4. Seed coach daily logs for today
        today_date = get_local_today_date()
        entry1 = NutritionEntry(
            user_id=user_id,
            entry_date=today_date,
            meal_name="Protein Oats with Peanut Butter",
            restaurant_name="Manual Entry",
            calories=450.0,
            protein_g=25.0,
            carbs_g=55.0,
            fat_g=10.0,
            source="manual",
            confidence=1.0,
            is_estimated=False
        )
        entry2 = NutritionEntry(
            user_id=user_id,
            entry_date=today_date,
            meal_name="Grilled Chicken Breast Salad",
            restaurant_name="Salad House",
            calories=550.0,
            protein_g=45.0,
            carbs_g=15.0,
            fat_g=12.0,
            source="order",
            confidence=0.9,
            is_estimated=True
        )
        db.add(entry1)
        db.add(entry2)

        # 5. Seed Household & Family structures (Sprint 10)
        hh_id = f"household_{secrets.token_hex(4)}"
        hh = Household(id=hh_id, name="My Home")
        db.add(hh)

        # Members
        m1 = HouseholdMember(
            id=f"member_{secrets.token_hex(4)}",
            household_id=hh_id,
            user_id=user_id,
            name="Primary User",
            dietary_preference="any",
            allergies=[]
        )
        m2 = HouseholdMember(
            id=f"member_{secrets.token_hex(4)}",
            household_id=hh_id,
            name="Jane (Spouse)",
            dietary_preference="vegetarian",
            allergies=["peanuts"],
            calorie_target=1800,
            protein_target=60
        )
        db.add(m1)
        db.add(m2)

        # Pantry Items
        p1 = PantryItem(
            id=f"pantry_{secrets.token_hex(4)}",
            household_id=hh_id,
            item_name="Nandini Fresh Milk 1L",
            quantity=1.0,
            unit="unit",
            min_threshold=2.0
        )
        p2 = PantryItem(
            id=f"pantry_{secrets.token_hex(4)}",
            household_id=hh_id,
            item_name="Eggoz White Eggs 6pcs",
            quantity=2.0,
            unit="unit",
            min_threshold=1.0
        )
        p3 = PantryItem(
            id=f"pantry_{secrets.token_hex(4)}",
            household_id=hh_id,
            item_name="India Gate Basmati Rice 1kg",
            quantity=0.0,
            unit="unit",
            min_threshold=1.0
        )
        db.add(p1)
        db.add(p2)
        db.add(p3)

        # Grocery List & Item
        gl_id = f"list_{secrets.token_hex(4)}"
        gl = GroceryList(id=gl_id, household_id=hh_id, name="Shopping List")
        db.add(gl)

        gli = GroceryListItem(
            id=f"item_{secrets.token_hex(4)}",
            grocery_list_id=gl_id,
            item_name="Hybrid Tomato 500g",
            quantity=2.0,
            unit="unit",
            is_purchased=False
        )
        db.add(gli)

        db.commit()
        return {"success": True, "message": "Demo data seeded successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Seeding failed: {str(e)}")
