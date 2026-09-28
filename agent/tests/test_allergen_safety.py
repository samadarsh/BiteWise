"""Regression tests for allergy / diet safety in NutriOrder ranking and
SmartPantry recipe suggestions."""
import os
from fastapi.testclient import TestClient

from agent.allergens import find_allergen_conflicts, violates_vegan
from agent.pipeline import NutriOrderPipeline
from agent.ranking import RankingEngine
from backend.main import app


def _meal(name, description=""):
    return {
        "item_name": name, "description": description, "restaurant_id": "r",
        "restaurant_name": "R", "item_id": name, "protein_g": 30, "calories": 500,
        "price": 200, "dietary_preference": "veg",
    }


def _ranked_names(meals, allergies):
    profile = {
        "allergies": allergies, "dislikes": [], "dietary_preference": "any",
        "target_protein": 30, "target_calories": 600, "typical_budget": 300,
    }
    return [m["item_name"] for m in RankingEngine().rank_meals(meals, profile)]


def test_ui_allergy_labels_actually_filter_dishes():
    """The UI saves "Nuts"/"Dairy"/"Gluten" — capitalized labels that never
    appear in a dish name. Previously none of them filtered anything."""
    meals = [
        _meal("Peanut Butter Smoothie"), _meal("Cashew Nut Curry"),
        _meal("Paneer Tikka"), _meal("Whole Wheat Roti"), _meal("Grilled Chicken Salad"),
    ]
    assert _ranked_names(meals, ["Nuts"]) == ["Paneer Tikka", "Whole Wheat Roti", "Grilled Chicken Salad"]
    assert "Paneer Tikka" not in _ranked_names(meals, ["Dairy"])
    assert "Whole Wheat Roti" not in _ranked_names(meals, ["Gluten"])
    assert _ranked_names(meals, ["Nuts", "Dairy", "Gluten"]) == ["Grilled Chicken Salad"]


def test_allergen_in_description_is_caught():
    meals = [_meal("Chef's Special Curry", "Rich gravy with cashew paste and cream")]
    assert _ranked_names(meals, ["Nuts"]) == []


def test_allergen_matching_is_whole_word():
    # "nut" must not match "Nutrition", "coconut", or a dish merely "Nutri"-branded.
    assert find_allergen_conflicts("nutrition bowl", ["Nuts"]) == []
    assert find_allergen_conflicts("coconut rice", ["Nuts"]) == []
    assert find_allergen_conflicts("peanuts chaat", ["peanut"]) == ["peanut"]
    assert find_allergen_conflicts("prawn curry", ["Shellfish"]) == ["Shellfish"]
    assert find_allergen_conflicts("sesame noodles", ["sesame"]) == ["sesame"]


def test_vegan_detection():
    assert violates_vegan("Paneer Butter Masala")
    assert violates_vegan("Masala Omelette eggs onion")
    assert not violates_vegan("Chana Masala chickpeas onion tomato oil")


def test_non_veg_query_is_not_read_as_veg():
    pipeline = NutriOrderPipeline(mcp_client=None, memory_manager=None, personalization_engine=None)
    for query in ("non veg thali", "nonveg biryani", "non-veg platter"):
        assert pipeline._parse_intent(query, {})["dietary_preference"] == "non-veg", query
    assert pipeline._parse_intent("veg thali", {})["dietary_preference"] == "veg"
    assert pipeline._parse_intent("high protein lunch", {})["dietary_preference"] == "any"


def _cook_today_names(client):
    return {s["name"] for s in client.get("/household/cook-today").json()["suggestions"]}


def test_smartpantry_peanut_allergy_hides_peanut_butter_recipe():
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as client:
        client.post("/auth/guest")
        assert "Protein Oats Bowl" in _cook_today_names(client)
        client.post("/household/members", json={"name": "Kid", "allergies": ["peanut"]})
        assert "Protein Oats Bowl" not in _cook_today_names(client)


def test_smartpantry_vegan_member_excludes_dairy_and_egg_recipes():
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as client:
        client.post("/auth/guest")
        client.post("/household/members", json={"name": "Sam", "dietary_preference": "vegan"})
        names = _cook_today_names(client)
        assert names, "vegan households should still get suggestions"
        assert not any("Paneer" in n or "Egg" in n or "Omelette" in n for n in names)
        assert "Protein Oats Bowl" not in names  # milk


def test_smartpantry_typed_dairy_allergy_is_honored():
    os.environ["USE_MOCK_MCP"] = "true"
    with TestClient(app) as client:
        client.post("/auth/guest")
        client.post("/household/members", json={"name": "Asha", "allergies": ["Dairy"]})
        names = _cook_today_names(client)
        assert not any("Paneer" in n for n in names)
