"""
PUT /me/profile had zero test coverage — GET /me/profile and GET /me/addresses
are exercised elsewhere (test_swiggy_auth_gaps.py, test_demo.py), but nothing
verified that a profile update actually persists.
"""
from fastapi.testclient import TestClient
from backend.main import app


def test_put_profile_persists_all_fields():
    with TestClient(app) as client:
        guest = client.post("/auth/guest").json()
        auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}

        payload = {
            "protein_target": 45,
            "calorie_target": 800,
            "diet_preference": "veg",
            "allergies": ["peanuts"],
            "dislikes": ["mushroom"],
            "favorite_cuisines": ["south indian"],
            "fitness_goal": "muscle_gain",
            "age": 29,
            "gender": "female",
            "height_cm": 165.5,
            "weight_kg": 60.0,
            "activity_level": "active",
            "meal_budget_default": 400,
            "preferred_meal_times": {"lunch": "13:00"},
            "spice_tolerance": "high",
            "priority_weights": {"protein_priority": 1.8, "speed_priority": 0.6},
        }
        res = client.put("/me/profile", json=payload, headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["message"] == "Profile updated successfully."

        fetched = client.get("/me/profile", headers=auth_headers)
        assert fetched.status_code == 200
        data = fetched.json()
        assert data["protein_target"] == 45
        assert data["diet_preference"] == "veg"
        assert data["allergies"] == ["peanuts"]
        assert data["age"] == 29
        assert data["height_cm"] == 165.5
        assert data["spice_tolerance"] == "high"
        assert data["priority_weights"] == {"protein_priority": 1.8, "speed_priority": 0.6}


def test_put_profile_rejects_out_of_range_values():
    """Pydantic field constraints (e.g. protein_target 10-100) must actually
    reject bad input, not just document a range nobody enforces."""
    with TestClient(app) as client:
        guest = client.post("/auth/guest").json()
        auth_headers = {"Authorization": f"Bearer {guest['session_token']}"}

        payload = {
            "protein_target": 5,  # below the documented minimum of 10
            "calorie_target": 800,
            "diet_preference": "veg",
            "allergies": [],
            "dislikes": [],
            "favorite_cuisines": [],
            "fitness_goal": "muscle_gain",
            "activity_level": "active",
            "meal_budget_default": 400,
            "preferred_meal_times": {},
            "spice_tolerance": "high",
        }
        res = client.put("/me/profile", json=payload, headers=auth_headers)
        assert res.status_code == 422
