from agent.ranking import RankingEngine

def test_ranking_muscle_gain():
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

    # Item A has very high protein
    item_a = {
        "item_id": "item_1",
        "item_name": "High Protein Grilled Chicken Bowl",
        "protein_g": 45,
        "price": 280,
        "delivery_time_min": 25,
        "dietary_preference": "non-veg",
        "rating": 4.5,
        "popularity_score": 0.9
    }

    # Item B has lower protein
    item_b = {
        "item_id": "item_2",
        "item_name": "General Veg Biryani",
        "protein_g": 10,
        "price": 180,
        "delivery_time_min": 30,
        "dietary_preference": "veg",
        "rating": 4.0,
        "popularity_score": 0.7
    }

    ranked = engine.rank_meals([item_a, item_b], profile)
    assert len(ranked) == 2
    assert ranked[0]["item_id"] == "item_1"
    assert ranked[0]["score"] > ranked[1]["score"]
    assert any("protein" in exp.lower() for exp in ranked[0]["explanations"])

def test_ranking_strict_dietary_pref():
    engine = RankingEngine()
    # User is strict Vegetarian
    profile = {
        "fitness_goal": "maintenance",
        "target_protein": 25,
        "target_calories": 600,
        "typical_budget": 300,
        "max_delivery_time_min": 45,
        "dietary_preference": "veg",
        "allergies": [],
        "dislikes": []
    }

    # Non-veg item
    item_non_veg = {
        "item_id": "item_1",
        "item_name": "Chicken Curry",
        "protein_g": 35,
        "price": 250,
        "delivery_time_min": 20,
        "dietary_preference": "non-veg",
        "rating": 4.2
    }

    # Veg item
    item_veg = {
        "item_id": "item_2",
        "item_name": "Paneer Makhani",
        "protein_g": 22,
        "price": 240,
        "delivery_time_min": 20,
        "dietary_preference": "veg",
        "rating": 4.1
    }

    ranked = engine.rank_meals([item_non_veg, item_veg], profile)
    # The non-veg item should be strictly filtered out by the DietaryPreferenceFactor returning 0 score
    assert len(ranked) == 1
    assert ranked[0]["item_id"] == "item_2"
