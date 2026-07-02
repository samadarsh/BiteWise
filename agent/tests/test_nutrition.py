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
