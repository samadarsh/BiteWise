import os
import secrets
import datetime
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
            # Add milk (stock_level="low") -> Low Stock
            res_p1 = client.post("/pantry", json={
                "item_name": "Milk",
                "stock_level": "low",
                "category": "Dairy"
            })
            assert res_p1.status_code == 200
            assert res_p1.json()["item_name"] == "Milk"
            assert res_p1.json()["stock_level"] == "low"
            
            # Add eggs (stock_level="full") -> In Stock
            res_p2 = client.post("/pantry", json={
                "item_name": "Eggs",
                "stock_level": "full",
                "category": "Proteins"
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
            # - Milk (Pantry has "low" -> Missing)
            # - Eggs (Pantry has "full" -> Matched)
            # - Lemon (Pantry has nothing -> Missing)
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
            assert added["Milk"] == 1.0 # default qualitative missing quantity
            assert "Lemon" in added
            assert added["Lemon"] == 1.0
            assert "Eggs" not in added # Pantry is full

            # 7. Mock Cart Preview
            res_preview = client.post("/grocery-list/cart-preview")
            assert res_preview.status_code == 200
            preview_data = res_preview.json()
            assert "total_estimated_cost_rupees" in preview_data
            
            # Checked unpurchased items in list: Milk (needed 1.0 pack), Lemon (needed 1.0 pack). Onion is purchased (True) so skipped.
            # Milk matches Nandini Fresh Milk 1L (Rs 46.0 * 1.0)
            # Lemon matches Fresh Lemon 4pcs (Rs 20.0 * 1.0)
            # Expected estimated cost = 46.0 + 20.0 = 66.0 rupees
            assert preview_data["total_estimated_cost_rupees"] == 66.0
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
    """Sprint 11/14: Tests low-stock detection, cook-today suggestions, insights, and grocery grouping."""

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
                ("Milk", "low", "Dairy"),
                ("Eggs", "full", "Proteins"),
                ("Rice", "empty", "Staples"),
                ("Onion", "full", "Vegetables"),
                ("Curd", "low", "Dairy"),
                ("Tomato", "low", "Vegetables"),
            ]
            for name, stock, category in pantry_seed:
                client.post("/pantry", json={
                    "item_name": name,
                    "stock_level": stock,
                    "category": category
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

            # Curd Rice should be suggested
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
            assert "Proteins" in categories or "Staples" in categories

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


def test_quick_stock_onboarding():
    """Verify that batch onboarding seeds items correctly and auto-allocates default expiry."""
    test_user_id = "user_test_qs"
    app.dependency_overrides[get_current_user_id] = lambda: test_user_id
    db = SessionLocal()
    try:
        with TestClient(app) as client:
            # Auto-provision household
            client.get("/household/my-home")
            
            # Quick stock items
            res = client.post("/pantry/quick-stock", json={
                "items": [
                    {"item_name": "Paneer", "stock_level": "full", "category": "Dairy"},
                    {"item_name": "Chicken", "stock_level": "full", "category": "Proteins"},
                    {"item_name": "Rice", "stock_level": "full", "category": "Staples"}
                ]
            })
            assert res.status_code == 200
            assert res.json()["added_count"] == 3

            # List pantry and check items are present and have default expiry set
            p_res = client.get("/pantry")
            pantry_items = {item["item_name"]: item for item in p_res.json()}
            assert "Paneer" in pantry_items
            assert pantry_items["Paneer"]["stock_level"] == "full"
            # Perishables get default expiry (Paneer is Dairy -> 4 days)
            assert pantry_items["Paneer"]["expiry_date"] is not None
            
            # Non-perishables (Rice) do NOT get default expiry
            assert pantry_items["Rice"]["expiry_date"] is None
    finally:
        member = db.query(HouseholdMember).filter(HouseholdMember.user_id == test_user_id).first()
        if member:
            hh_id = member.household_id
            db.query(PantryItem).filter(PantryItem.household_id == hh_id).delete()
            db.query(HouseholdMember).filter(HouseholdMember.household_id == hh_id).delete()
            db.query(Household).filter(Household.id == hh_id).delete()
            db.commit()
        db.close()
        app.dependency_overrides.pop(get_current_user_id, None)


def test_cook_auto_decrement():
    """Verify that cooking a recipe decrements corresponding pantry items by one stock tier."""
    test_user_id = "user_test_cook"
    app.dependency_overrides[get_current_user_id] = lambda: test_user_id
    db = SessionLocal()
    try:
        with TestClient(app) as client:
            client.get("/household/my-home")
            
            # Seed pantry with full items needed for Paneer Butter Masala
            # Ingredients: paneer, butter, tomato, cream, onion
            for item in ["Paneer", "Butter", "Tomato", "Cream", "Onion"]:
                client.post("/pantry", json={
                    "item_name": item,
                    "stock_level": "full",
                    "category": "Dairy" if item in ["Paneer", "Butter", "Cream"] else "Vegetables"
                })

            # Cook Paneer Butter Masala
            cook_res = client.post("/pantry/cook/Paneer Butter Masala")
            assert cook_res.status_code == 200
            assert cook_res.json()["success"] is True

            # Verify stock levels decremented to half
            p_res = client.get("/pantry")
            pantry_items = {item["item_name"]: item for item in p_res.json()}
            assert pantry_items["Paneer"]["stock_level"] == "half"
            assert pantry_items["Butter"]["stock_level"] == "half"
            assert pantry_items["Tomato"]["stock_level"] == "half"
    finally:
        member = db.query(HouseholdMember).filter(HouseholdMember.user_id == test_user_id).first()
        if member:
            hh_id = member.household_id
            db.query(PantryItem).filter(PantryItem.household_id == hh_id).delete()
            db.query(HouseholdMember).filter(HouseholdMember.household_id == hh_id).delete()
            db.query(Household).filter(Household.id == hh_id).delete()
            db.commit()
        db.close()
        app.dependency_overrides.pop(get_current_user_id, None)


def test_bulk_item_slow_decrement():
    """Verify that bulk items only decrement their stock tier every 3rd cook action."""
    test_user_id = "user_test_bulk"
    app.dependency_overrides[get_current_user_id] = lambda: test_user_id
    db = SessionLocal()
    try:
        with TestClient(app) as client:
            client.get("/household/my-home")
            
            # Oil is is_bulk = True, seeded at full
            client.post("/pantry", json={
                "item_name": "Oil",
                "stock_level": "full",
                "category": "Spices",
                "is_bulk": True
            })

            # Cook fried rice once (uses oil)
            c1 = client.post("/pantry/cook/Chicken Fried Rice")
            assert c1.status_code == 200
            
            p1 = client.get("/pantry")
            assert p1.json()[0]["stock_level"] == "full"
            assert p1.json()[0]["bulk_use_count"] == 1

            # Cook again
            c2 = client.post("/pantry/cook/Chicken Fried Rice")
            assert c2.status_code == 200
            p2 = client.get("/pantry")
            assert p2.json()[0]["stock_level"] == "full"
            assert p2.json()[0]["bulk_use_count"] == 2

            # Cook 3rd time -> should decrement to half
            c3 = client.post("/pantry/cook/Chicken Fried Rice")
            assert c3.status_code == 200
            p3 = client.get("/pantry")
            assert p3.json()[0]["stock_level"] == "half"
            assert p3.json()[0]["bulk_use_count"] == 3
    finally:
        member = db.query(HouseholdMember).filter(HouseholdMember.user_id == test_user_id).first()
        if member:
            hh_id = member.household_id
            db.query(PantryItem).filter(PantryItem.household_id == hh_id).delete()
            db.query(HouseholdMember).filter(HouseholdMember.household_id == hh_id).delete()
            db.query(Household).filter(Household.id == hh_id).delete()
            db.commit()
        db.close()
        app.dependency_overrides.pop(get_current_user_id, None)


def test_expiring_items():
    """Verify that expiring items endpoint lists perishable items correctly according to deadlines."""
    test_user_id = "user_test_expiry"
    app.dependency_overrides[get_current_user_id] = lambda: test_user_id
    db = SessionLocal()
    try:
        with TestClient(app) as client:
            client.get("/household/my-home")
            
            # Seed Paneer (expiry_date manual: 1 day from now -> urgent)
            tomorrow = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).date()
            client.post("/pantry", json={
                "item_name": "Paneer",
                "stock_level": "full",
                "category": "Dairy",
                "expiry_date": tomorrow.isoformat()
            })

            # Check expiring endpoint
            exp_res = client.get("/pantry/expiring?days=2")
            assert exp_res.status_code == 200
            data = exp_res.json()
            assert data["total_count"] == 1
            assert data["expiring_items"][0]["item_name"] == "Paneer"
            assert data["expiring_items"][0]["urgency"] == "tomorrow"
    finally:
        member = db.query(HouseholdMember).filter(HouseholdMember.user_id == test_user_id).first()
        if member:
            hh_id = member.household_id
            db.query(PantryItem).filter(PantryItem.household_id == hh_id).delete()
            db.query(HouseholdMember).filter(HouseholdMember.household_id == hh_id).delete()
            db.query(Household).filter(Household.id == hh_id).delete()
            db.commit()
        db.close()
        app.dependency_overrides.pop(get_current_user_id, None)


def test_mark_purchased_restocks_pantry():
    """Verify that marking items purchased on the grocery list auto-restocks the corresponding pantry items to full."""
    test_user_id = "user_test_purch"
    app.dependency_overrides[get_current_user_id] = lambda: test_user_id
    db = SessionLocal()
    try:
        with TestClient(app) as client:
            client.get("/household/my-home")
            
            # Seed Milk at empty
            client.post("/pantry", json={
                "item_name": "Milk",
                "stock_level": "empty",
                "category": "Dairy"
            })

            # Trigger low-stock alert to auto-add Milk to grocery list
            client.get("/household/low-stock")

            # Fetch grocery list to get item ID for Milk
            gl_res = client.get("/grocery-list")
            milk_grocery_item = [item for item in gl_res.json()["items"] if item["item_name"] == "Milk"][0]
            item_id = milk_grocery_item["id"]

            # Restock Milk via mark-purchased
            res = client.post("/pantry/mark-purchased", json={
                "item_ids": [item_id]
            })
            assert res.status_code == 200
            assert "Milk" in res.json()["restocked_to_full"]

            # Verify pantry item is now full
            p_res = client.get("/pantry")
            assert p_res.json()[0]["stock_level"] == "full"
            assert p_res.json()[0]["expiry_date"] is not None # should have recomputed expiry
    finally:
        member = db.query(HouseholdMember).filter(HouseholdMember.user_id == test_user_id).first()
        if member:
            hh_id = member.household_id
            db.query(PantryItem).filter(PantryItem.household_id == hh_id).delete()
            g_lists = db.query(GroceryList).filter(GroceryList.household_id == hh_id).all()
            for gl in g_lists:
                db.query(GroceryListItem).filter(GroceryListItem.grocery_list_id == gl.id).delete()
                db.delete(gl)
            db.query(HouseholdMember).filter(HouseholdMember.household_id == hh_id).delete()
            db.query(Household).filter(Household.id == hh_id).delete()
            db.commit()
        db.close()
        app.dependency_overrides.pop(get_current_user_id, None)
