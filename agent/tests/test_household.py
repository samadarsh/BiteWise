import os
import secrets
from fastapi.testclient import TestClient
from backend.main import app
from backend.db.session import SessionLocal
from backend.auth.sessions import get_current_user_id

from backend.household.models import Household, HouseholdMember
from backend.pantry.models import PantryItem
from backend.grocery.models import GroceryList, GroceryListItem, RecipePlan

def test_household_module_flow():
    """Unified test verifying the full household foundation, pantry, recipe scanning, and cart preview."""
    
    test_user_id = "user_test_hh"
    
    # 1. Setup Auth override
    app.dependency_overrides[get_current_user_id] = lambda: test_user_id
    
    db = SessionLocal()
    try:
        # Pre-cleanup in case of dirty database state
        member = db.query(HouseholdMember).filter(HouseholdMember.user_id == test_user_id).first()
        if member:
            hh_id = member.household_id
            db.query(RecipePlan).filter(RecipePlan.household_id == hh_id).delete()
            db.query(PantryItem).filter(PantryItem.household_id == hh_id).delete()
            g_lists = db.query(GroceryList).filter(GroceryList.household_id == hh_id).all()
            for gl in g_lists:
                db.query(GroceryListItem).filter(GroceryListItem.grocery_list_id == gl.id).delete()
                db.delete(gl)
            db.query(HouseholdMember).filter(HouseholdMember.household_id == hh_id).delete()
            db.query(Household).filter(Household.id == hh_id).delete()
            db.commit()

        # 2. Verify Default Household Auto-provisioning
        with TestClient(app) as client:
            res_hh = client.get("/household/my-home")
            assert res_hh.status_code == 200
            hh_data = res_hh.json()
            assert "id" in hh_data
            assert hh_data["name"] == "My Home"
            assert len(hh_data["members"]) == 1
            assert hh_data["members"][0]["name"] == "Primary User"
            assert hh_data["members"][0]["user_id"] == test_user_id
            
            household_id = hh_data["id"]

            # 3. Verify Member Add/Update/Delete Lifecycle
            res_add = client.post("/household/members", json={
                "name": "Jane (Spouse)",
                "dietary_preference": "vegetarian",
                "allergies": ["peanuts"],
                "calorie_target": 1800,
                "protein_target": 65
            })
            assert res_add.status_code == 200
            member_data = res_add.json()
            assert member_data["name"] == "Jane (Spouse)"
            assert member_data["dietary_preference"] == "vegetarian"
            assert "peanuts" in member_data["allergies"]
            
            member_id = member_data["id"]

            res_put = client.post("/household/members", json={
                "name": "Tommy (Child)",
                "dietary_preference": "any",
                "allergies": []
            })
            assert res_put.status_code == 200
            child_id = res_put.json()["id"]

            # Delete member
            res_del = client.delete(f"/household/members/{child_id}")
            assert res_del.status_code == 200
            assert res_del.json()["success"] is True

            # 4. Pantry CRUD
            # Add milk (qty=1.0, min=2.0) -> Low Stock
            res_p1 = client.post("/pantry", json={
                "item_name": "Milk",
                "quantity": 1.0,
                "unit": "L",
                "min_threshold": 2.0
            })
            assert res_p1.status_code == 200
            assert res_p1.json()["item_name"] == "Milk"
            
            # Add eggs (qty=6.0, min=6.0) -> In Stock
            res_p2 = client.post("/pantry", json={
                "item_name": "Eggs",
                "quantity": 6.0,
                "unit": "unit",
                "min_threshold": 6.0
            })
            assert res_p2.status_code == 200

            # List pantry items
            res_list = client.get("/pantry")
            assert res_list.status_code == 200
            items = res_list.json()
            assert len(items) == 2
            assert any(item["item_name"] == "Milk" for item in items)

            # 5. Grocery List Item Lifecycle
            # List starts empty (will auto-create list)
            res_gl = client.get("/grocery-list")
            assert res_gl.status_code == 200
            assert len(res_gl.json()["items"]) == 0

            # Add onions directly
            res_gi = client.post("/grocery-list/items", json={
                "item_name": "Onion",
                "quantity": 1.0,
                "unit": "kg"
            })
            assert res_gi.status_code == 200
            onion_item_id = res_gi.json()["id"]

            # Toggle purchase flag
            res_toggle = client.put(f"/grocery-list/items/{onion_item_id}", json={
                "is_purchased": True
            })
            assert res_toggle.status_code == 200
            assert res_toggle.json()["is_purchased"] is True

            # 6. Recipe Missing Ingredient calculations
            # Recipe needs:
            # - Milk: 2.0 L (Pantry has 1.0 L -> Missing 1.0 L)
            # - Eggs: 4.0 unit (Pantry has 6.0 unit -> Missing 0.0)
            # - Lemon: 2.0 unit (Pantry has 0.0 -> Missing 2.0)
            res_match = client.post("/grocery-list/recipe-match", json={
                "recipe_name": "Omelette & Lemonade Combo",
                "ingredients": [
                    {"name": "Milk", "qty": 2.0, "unit": "L"},
                    {"name": "Eggs", "qty": 4.0, "unit": "unit"},
                    {"name": "Lemon", "qty": 2.0, "unit": "unit"}
                ],
                "planned_for_date": "2026-07-05"
            })
            assert res_match.status_code == 200
            match_data = res_match.json()
            assert match_data["success"] is True
            
            # Check added list
            added = {item["name"]: item["quantity"] for item in match_data["added_to_grocery_list"]}
            assert "Milk" in added
            assert added["Milk"] == 1.0 # 2.0 - 1.0 = 1.0 missing
            assert "Lemon" in added
            assert added["Lemon"] == 2.0 # 2.0 - 0.0 = 2.0 missing
            assert "Eggs" not in added # Pantry has 6.0, only needed 4.0

            # 7. Mock Cart Preview
            res_preview = client.post("/grocery-list/cart-preview")
            assert res_preview.status_code == 200
            preview_data = res_preview.json()
            assert "total_estimated_cost_rupees" in preview_data
            
            # Checked unpurchased items in list: Milk (needed 1.0), Lemon (needed 2.0). Onion is purchased (True) so skipped.
            # Milk matches Nandini Fresh Milk 1L (Rs 46.0 * 1.0)
            # Lemon matches Fresh Lemon 4pcs (Rs 20.0 * 2.0)
            # Expected estimated cost = 46.0 + 40.0 = 86.0 rupees
            assert preview_data["total_estimated_cost_rupees"] == 86.0
            assert preview_data["total_items_count"] == 2

        # 8. Post-cleanup
        db.query(RecipePlan).filter(RecipePlan.household_id == household_id).delete()
        db.query(PantryItem).filter(PantryItem.household_id == household_id).delete()
        g_lists = db.query(GroceryList).filter(GroceryList.household_id == household_id).all()
        for gl in g_lists:
            db.query(GroceryListItem).filter(GroceryListItem.grocery_list_id == gl.id).delete()
            db.delete(gl)
        db.query(HouseholdMember).filter(HouseholdMember.household_id == household_id).delete()
        db.query(Household).filter(Household.id == household_id).delete()
        db.commit()

    finally:
        db.close()
        app.dependency_overrides.pop(get_current_user_id, None)


def test_household_intelligence_flow():
    """Sprint 11: Tests low-stock detection, cook-today suggestions, insights, and grocery grouping."""

    test_user_id = "user_test_intel"

    app.dependency_overrides[get_current_user_id] = lambda: test_user_id

    db = SessionLocal()
    try:
        # Pre-cleanup
        member = db.query(HouseholdMember).filter(HouseholdMember.user_id == test_user_id).first()
        if member:
            hh_id = member.household_id
            db.query(RecipePlan).filter(RecipePlan.household_id == hh_id).delete()
            db.query(PantryItem).filter(PantryItem.household_id == hh_id).delete()
            g_lists = db.query(GroceryList).filter(GroceryList.household_id == hh_id).all()
            for gl in g_lists:
                db.query(GroceryListItem).filter(GroceryListItem.grocery_list_id == gl.id).delete()
                db.delete(gl)
            db.query(HouseholdMember).filter(HouseholdMember.household_id == hh_id).delete()
            db.query(Household).filter(Household.id == hh_id).delete()
            db.commit()

        with TestClient(app) as client:
            # Auto-provision household
            res_hh = client.get("/household/my-home")
            assert res_hh.status_code == 200
            household_id = res_hh.json()["id"]

            # Add a vegetarian member with peanut allergy
            client.post("/household/members", json={
                "name": "Jane (Spouse)",
                "dietary_preference": "vegetarian",
                "allergies": ["peanuts"],
                "calorie_target": 1800,
                "protein_target": 60
            })

            # Seed pantry with known stock levels
            pantry_seed = [
                ("Milk", 1.0, "L", 2.0),       # low
                ("Eggs", 6.0, "unit", 6.0),     # ok
                ("Rice", 0.0, "kg", 1.0),       # out of stock
                ("Onion", 2.0, "kg", 1.0),      # ok
                ("Curd", 0.5, "kg", 1.0),       # low
                ("Tomato", 0.3, "kg", 0.5),     # low
            ]
            for name, qty, unit, threshold in pantry_seed:
                client.post("/pantry", json={
                    "item_name": name,
                    "quantity": qty,
                    "unit": unit,
                    "min_threshold": threshold,
                })

            # ── Test 1: Low-Stock Detection ──────────────
            res_low = client.get("/household/low-stock")
            assert res_low.status_code == 200
            low_data = res_low.json()
            assert low_data["total_alerts"] == 4  # Milk, Rice, Curd, Tomato
            assert low_data["out_of_stock_count"] == 1  # Rice
            assert low_data["low_stock_count"] == 3  # Milk, Curd, Tomato

            severities = {a["item_name"]: a["severity"] for a in low_data["alerts"]}
            assert severities["Rice"] == "out_of_stock"
            assert severities["Milk"] == "low"
            assert severities["Curd"] == "low"
            assert severities["Tomato"] == "low"

            # Rice should be auto-added to grocery list
            assert "Rice" in low_data["auto_added_to_grocery"]

            # ── Test 2: Cook Today Suggestions ──────────────
            res_cook = client.get("/household/cook-today")
            assert res_cook.status_code == 200
            cook_data = res_cook.json()
            assert cook_data["total_recipes"] > 0

            # Should skip non-veg recipes because Jane is vegetarian
            suggestion_names = [s["name"] for s in cook_data["suggestions"]]
            assert "Butter Chicken" not in suggestion_names
            assert "Masala Omelette" not in suggestion_names

            # Lemon Rice should be skipped due to peanut allergy
            skipped_names = [s["recipe"] for s in cook_data["skipped_recipes"]]
            assert "Lemon Rice" in skipped_names

            # Curd Rice should be suggested (we have rice=0 but still appears with coverage < 100)
            assert "Curd Rice" in suggestion_names

            # Suggestions should be sorted by coverage descending
            coverages = [s["coverage_pct"] for s in cook_data["suggestions"]]
            assert coverages == sorted(coverages, reverse=True)

            # ── Test 3: Household Insights ──────────────
            res_insights = client.get("/household/insights")
            assert res_insights.status_code == 200
            insights = res_insights.json()
            assert insights["total_members"] == 2
            assert insights["total_household_protein"] == 60  # Primary has 0 target, Jane has 60
            assert "peanuts" in insights["combined_allergies"]
            assert len(insights["dietary_conflicts"]) > 0  # veg vs non-veg

            # ── Test 4: Grocery Grouping ──────────────
            # Add a chicken item to grocery list
            client.post("/grocery-list/items", json={
                "item_name": "Chicken Breast",
                "quantity": 0.5,
                "unit": "kg"
            })

            res_grouped = client.get("/grocery-list/grouped")
            assert res_grouped.status_code == 200
            grouped = res_grouped.json()
            assert grouped["total_items"] >= 2  # Rice (auto-added) + Chicken

            # Verify categories exist
            categories = [g["category"] for g in grouped["groups"]]
            assert "Eggs & Meat" in categories or "Staples" in categories

        # Post-cleanup
        db.query(RecipePlan).filter(RecipePlan.household_id == household_id).delete()
        db.query(PantryItem).filter(PantryItem.household_id == household_id).delete()
        g_lists = db.query(GroceryList).filter(GroceryList.household_id == household_id).all()
        for gl in g_lists:
            db.query(GroceryListItem).filter(GroceryListItem.grocery_list_id == gl.id).delete()
            db.delete(gl)
        db.query(HouseholdMember).filter(HouseholdMember.household_id == household_id).delete()
        db.query(Household).filter(Household.id == household_id).delete()
        db.commit()

    finally:
        db.close()
        app.dependency_overrides.pop(get_current_user_id, None)
