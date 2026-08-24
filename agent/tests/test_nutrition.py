import pytest
from agent.nutrition_targets import NutritionTargetEngine
from agent.nutrition_estimator import NutritionEstimator
from agent.ranking import RankingEngine
from backend.db.models import OrderFeedback, UserProfile
from backend.recommendations.models import SearchRequestSchema
from pydantic import ValidationError

def test_nutrition_targets_calc():
    # Test Mifflin-St Jeor calculation for a moderately active male
    profile = {
        "age": 25,
        "gender": "male",
        "height_cm": 180,
        "weight_kg": 80,
        "activity_level": "moderate",
        "fitness_goal": "muscle_gain"
    }
    targets = NutritionTargetEngine.calculate_targets(profile)
    assert targets["daily_calories"] > 1500
    assert targets["meal_calories"] > 500
    assert targets["meal_protein"] > 25
    assert "calorie surplus" in targets["goal_reason"]

    # Test female fat loss
    profile_female = {
        "age": 30,
        "gender": "female",
        "height_cm": 160,
        "weight_kg": 65,
        "activity_level": "light",
        "fitness_goal": "fat_loss"
    }
    targets_f = NutritionTargetEngine.calculate_targets(profile_female)
    assert targets_f["daily_calories"] < targets["daily_calories"]
    assert "calorie deficit" in targets_f["goal_reason"]

def test_nutrition_estimator():
    # High confidence item
    est = NutritionEstimator.estimate_nutrition(
        "Grilled Chicken Salad with Egg White",
        "Premium chicken breast, green salad leaves, boiled egg whites"
    )
    assert est["estimated_protein_g"] >= 25
    assert est["estimated_calories"] >= 200
    assert est["confidence"] >= 0.75

    # Low confidence/vague item
    est_magic = NutritionEstimator.estimate_nutrition(
        "Magic Special Platter",
        "Tasty surprise dish from the chef."
    )
    assert est_magic["estimated_protein_g"] == 8  # default fallback
    assert est_magic["estimated_calories"] == 350  # default fallback
    assert est_magic["confidence"] < 0.6

def test_ranking_with_priorities():
    engine = RankingEngine()
    profile = {
        "fitness_goal": "muscle_gain",
        "target_protein": 30,
        "target_calories": 750,
        "typical_budget": 300,
        "max_delivery_time_min": 45,
        "dietary_preference": "any",
        "allergies": [],
        "dislikes": []
    }
    items = [
        {
            "item_id": "item_chicken",
            "item_name": "High Protein Chicken Salad",
            "protein_g": 35,
            "calories": 400,
            "price": 280,
            "delivery_time_min": 25,
            "rating": 4.5
        },
        {
            "item_id": "item_butter_nan",
            "item_name": "Butter Naan with Gravy",
            "protein_g": 8,
            "calories": 750,
            "price": 150,
            "delivery_time_min": 20,
            "rating": 4.2
        }
    ]

    # Rank with high protein priority
    ranked_protein = engine.rank_meals(
        items, 
        profile, 
        custom_priorities={"protein_priority": 2.0, "calorie_priority": 0.5}
    )
    assert ranked_protein[0]["item_id"] == "item_chicken"
    assert "why_this_meal" in ranked_protein[0]
    assert "tradeoffs" in ranked_protein[0]

def test_search_request_schema():
    # Valid schema payload
    valid_payload = {
        "session_id": "session_123",
        "query": "high protein veg salad",
        "priorities": {"protein_priority": 1.5},
        "relaxation_patch": {"calorie_target": 800}
    }
    schema = SearchRequestSchema(**valid_payload)
    assert schema.session_id == "session_123"
    assert schema.priorities["protein_priority"] == 1.5

    # Invalid payload missing query
    with pytest.raises(ValidationError):
        SearchRequestSchema(session_id="session_abc")


def test_db_memory_loads_biometrics_for_target_engine():
    from backend.db.session import engine, Base, SessionLocal
    from backend.db.models import User
    from agent.memory import UserMemoryManager

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        db.query(UserProfile).filter(UserProfile.user_id == "nutrition_bio_user").delete()
        db.query(User).filter(User.id == "nutrition_bio_user").delete()
        db.commit()

        db.add(User(id="nutrition_bio_user"))
        db.add(UserProfile(
            user_id="nutrition_bio_user",
            protein_target=35,
            calorie_target=650,
            diet_preference="any",
            fitness_goal="muscle_gain",
            age=28,
            gender="male",
            height_cm=178,
            weight_kg=76,
            activity_level="moderate",
            meal_budget_default=420,
            preferred_meal_times={"lunch": "13:00"},
            spice_tolerance="medium",
        ))
        db.commit()

        memory = UserMemoryManager(db=db, user_id="nutrition_bio_user")
        assert memory.profile["age"] == 28
        assert memory.profile["weight_kg"] == 76
        assert memory.profile["typical_budget"] == 420

        targets = NutritionTargetEngine.calculate_targets(memory.profile)
        assert targets["daily_calories"] > 2500
        assert targets["meal_protein"] > 40
    finally:
        db.close()


def test_pipeline_relaxation_patch_overrides_computed_targets():
    from agent.pipeline import NutriOrderPipeline

    class MemoryStub:
        def get_merged_constraints(self, session_constraints):
            profile = {
                "dislikes": [],
                "allergies": [],
                "favorite_cuisines": [],
                "preferred_restaurants": [],
                "typical_budget": 300,
                "fitness_goal": "muscle_gain",
                "target_protein": 30,
                "target_calories": 650,
                "dietary_preference": "any",
                "preferences": [],
                "age": 28,
                "gender": "male",
                "height_cm": 178,
                "weight_kg": 76,
                "activity_level": "moderate",
                "query": session_constraints.get("query", "protein"),
            }
            if session_constraints.get("protein_target"):
                profile["target_protein"] = session_constraints["protein_target"]
            if session_constraints.get("calorie_target"):
                profile["target_calories"] = session_constraints["calorie_target"]
            return profile

    pipeline = NutriOrderPipeline(
        mcp_client=None,
        memory_manager=MemoryStub(),
        personalization_engine=type("PersonalizationStub", (), {"get_personalization_summary": lambda self: {}})(),
    )
    constraints = {"protein_target": 22, "calorie_target": 720, "query": "paneer"}
    intent = pipeline._parse_intent("paneer", constraints)
    profile = pipeline._plan_nutrition(intent)

    assert profile["target_protein"] == 22
    assert profile["target_calories"] == 720


def test_convert_mcp_items_coerces_string_rating_without_crashing():
    """Regression: real search_menu items send "rating" as a string
    (confirmed live: {"rating": "4.8"}), and RestaurantRatingFactor divides
    it by 5.0 — an uncoerced string crashed the whole pipeline with
    "unsupported operand type(s) for /: 'str' and 'float'", silently
    swallowed and misreported to the user as "no strict matches"."""
    from agent.pipeline import NutriOrderPipeline
    from agent.ranking import RankingEngine

    pipeline = NutriOrderPipeline(mcp_client=None, memory_manager=None, personalization_engine=None)
    real_items = [
        {"name": "BBQ Grilled Chicken Wings", "price": 269, "menu_item_id": "m1", "restaurant_id": "r1", "restaurant_name": "WeFit", "rating": "4.8"},
        {"name": "Herb Grilled Chicken Wings", "price": 269, "menu_item_id": "m2", "restaurant_id": "r1", "restaurant_name": "WeFit"},
    ]
    candidates = pipeline._convert_mcp_items(real_items)
    # First item has a real (string) rating -> coerced to float, never crashes.
    # Second item has no rating at all -> honestly None, not a fabricated default.
    assert isinstance(candidates[0]["rating"], float)
    assert candidates[1]["rating"] is None

    profile = {
        "target_protein": 35, "target_calories": 650, "dietary_preference": "any",
        "typical_budget": 300, "allergies": [], "dislikes": [], "fitness_goal": "maintenance",
    }
    ranked = RankingEngine().rank_meals(candidates, profile)
    assert len(ranked) == 2
