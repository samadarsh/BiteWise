"""
Household Intelligence Engines — Sprint 11

Deterministic, rule-based intelligence layer.
No LLM calls. No real Instamart mutations. Fully testable.
"""
import secrets
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.household.models import Household, HouseholdMember
from backend.pantry.models import PantryItem
from backend.grocery.models import GroceryList, GroceryListItem


# ──────────────────────────────────────────────
# Seeded Recipe Templates
# ──────────────────────────────────────────────

RECIPE_TEMPLATES: List[Dict[str, Any]] = [
    {
        "name": "Butter Chicken",
        "tag": "Quick dinner from pantry",
        "diet": "non-veg",
        "allergens": [],
        "ingredients": [
            {"name": "chicken", "qty": 0.5, "unit": "kg"},
            {"name": "butter", "qty": 0.1, "unit": "kg"},
            {"name": "tomato", "qty": 0.3, "unit": "kg"},
            {"name": "onion", "qty": 0.2, "unit": "kg"},
            {"name": "cream", "qty": 0.1, "unit": "L"},
        ],
    },
    {
        "name": "Paneer Fried Rice",
        "tag": "Quick dinner from pantry",
        "diet": "veg",
        "allergens": [],
        "ingredients": [
            {"name": "rice", "qty": 0.3, "unit": "kg"},
            {"name": "paneer", "qty": 0.2, "unit": "kg"},
            {"name": "onion", "qty": 0.1, "unit": "kg"},
            {"name": "oil", "qty": 0.05, "unit": "L"},
        ],
    },
    {
        "name": "High-Protein Egg Bhurji",
        "tag": "High-protein breakfast",
        "diet": "non-veg",
        "allergens": ["eggs"],
        "ingredients": [
            {"name": "eggs", "qty": 4.0, "unit": "unit"},
            {"name": "onion", "qty": 0.1, "unit": "kg"},
            {"name": "tomato", "qty": 0.1, "unit": "kg"},
            {"name": "oil", "qty": 0.02, "unit": "L"},
        ],
    },
    {
        "name": "Dal Tadka",
        "tag": "Quick dinner from pantry",
        "diet": "veg",
        "allergens": [],
        "ingredients": [
            {"name": "toor dal", "qty": 0.2, "unit": "kg"},
            {"name": "onion", "qty": 0.1, "unit": "kg"},
            {"name": "tomato", "qty": 0.1, "unit": "kg"},
            {"name": "ghee", "qty": 0.03, "unit": "kg"},
        ],
    },
    {
        "name": "Paneer Butter Masala",
        "tag": "Quick dinner from pantry",
        "diet": "veg",
        "allergens": [],
        "ingredients": [
            {"name": "paneer", "qty": 0.25, "unit": "kg"},
            {"name": "butter", "qty": 0.05, "unit": "kg"},
            {"name": "tomato", "qty": 0.2, "unit": "kg"},
            {"name": "cream", "qty": 0.05, "unit": "L"},
            {"name": "onion", "qty": 0.1, "unit": "kg"},
        ],
    },
    {
        "name": "Curd Rice",
        "tag": "Quick dinner from pantry",
        "diet": "veg",
        "allergens": [],
        "ingredients": [
            {"name": "rice", "qty": 0.2, "unit": "kg"},
            {"name": "curd", "qty": 0.3, "unit": "kg"},
            {"name": "mustard seeds", "qty": 0.01, "unit": "kg"},
        ],
    },
    {
        "name": "Lemon Rice",
        "tag": "Quick dinner from pantry",
        "diet": "veg",
        "allergens": ["peanuts"],
        "ingredients": [
            {"name": "rice", "qty": 0.2, "unit": "kg"},
            {"name": "lemon", "qty": 2.0, "unit": "unit"},
            {"name": "oil", "qty": 0.03, "unit": "L"},
            {"name": "peanuts", "qty": 0.05, "unit": "kg"},
        ],
    },
    {
        "name": "Masala Omelette",
        "tag": "High-protein breakfast",
        "diet": "non-veg",
        "allergens": ["eggs"],
        "ingredients": [
            {"name": "eggs", "qty": 3.0, "unit": "unit"},
            {"name": "onion", "qty": 0.05, "unit": "kg"},
            {"name": "green chilli", "qty": 2.0, "unit": "unit"},
        ],
    },
    {
        "name": "Aloo Gobi",
        "tag": "Quick dinner from pantry",
        "diet": "veg",
        "allergens": [],
        "ingredients": [
            {"name": "potato", "qty": 0.3, "unit": "kg"},
            {"name": "cauliflower", "qty": 0.3, "unit": "kg"},
            {"name": "onion", "qty": 0.1, "unit": "kg"},
            {"name": "oil", "qty": 0.03, "unit": "L"},
        ],
    },
    {
        "name": "Protein Oats Bowl",
        "tag": "High-protein breakfast",
        "diet": "veg",
        "allergens": [],
        "ingredients": [
            {"name": "oats", "qty": 0.1, "unit": "kg"},
            {"name": "milk", "qty": 0.25, "unit": "L"},
            {"name": "banana", "qty": 1.0, "unit": "unit"},
            {"name": "peanut butter", "qty": 0.02, "unit": "kg"},
        ],
    },
]


# ──────────────────────────────────────────────
# Grocery Category Mapping
# ──────────────────────────────────────────────

CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "Dairy": ["milk", "curd", "yogurt", "butter", "ghee", "paneer", "cheese", "cream"],
    "Eggs & Meat": ["egg", "chicken", "mutton", "fish", "prawns"],
    "Fruits & Vegetables": ["tomato", "onion", "potato", "spinach", "lemon", "cauliflower",
                            "palak", "banana", "green chilli", "ginger", "garlic"],
    "Staples": ["rice", "dal", "atta", "wheat", "oil", "sugar", "salt", "oats",
                "mustard seeds", "peanuts", "peanut butter", "toor dal"],
    "Bakery": ["bread", "pav", "bun"],
}


def _classify_item(item_name: str) -> str:
    """Classify a grocery item into a category using keyword matching."""
    clean = item_name.lower().strip()
    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in clean:
                return category
    return "Other"


# ──────────────────────────────────────────────
# Engine 1: Low-Stock Detection
# ──────────────────────────────────────────────

def detect_low_stock(
    db: Session,
    household_id: str,
    auto_add_to_grocery: bool = True,
) -> Dict[str, Any]:
    """
    Scans pantry for items below their min_threshold.
    Optionally auto-adds out-of-stock items to the grocery list.
    """
    pantry_items = db.query(PantryItem).filter(
        PantryItem.household_id == household_id
    ).all()

    alerts: List[Dict[str, Any]] = []
    auto_added: List[str] = []

    for item in pantry_items:
        threshold = item.min_threshold
        if threshold is None or threshold <= 0:
            continue

        if item.quantity <= 0:
            severity = "out_of_stock"
        elif item.quantity < threshold:
            severity = "low"
        else:
            continue  # healthy stock

        deficit = max(0.0, threshold - item.quantity)
        alerts.append({
            "item_name": item.item_name,
            "current_qty": item.quantity,
            "unit": item.unit,
            "min_threshold": threshold,
            "deficit": round(deficit, 2),
            "severity": severity,
        })

    # Auto-add out-of-stock items to grocery list
    if auto_add_to_grocery and alerts:
        active_list = _get_or_create_grocery_list(db, household_id)
        existing_names = {
            gli.item_name.lower().strip()
            for gli in db.query(GroceryListItem).filter(
                GroceryListItem.grocery_list_id == active_list.id,
                GroceryListItem.is_purchased == False
            ).all()
        }

        for alert in alerts:
            if alert["severity"] == "out_of_stock":
                clean_name = alert["item_name"].lower().strip()
                if clean_name not in existing_names:
                    item_id = f"item_{secrets.token_hex(4)}"
                    db.add(GroceryListItem(
                        id=item_id,
                        grocery_list_id=active_list.id,
                        item_name=alert["item_name"],
                        quantity=alert["deficit"],
                        unit=alert["unit"],
                        is_purchased=False,
                    ))
                    auto_added.append(alert["item_name"])

        if auto_added:
            db.commit()

    return {
        "alerts": alerts,
        "total_alerts": len(alerts),
        "out_of_stock_count": sum(1 for a in alerts if a["severity"] == "out_of_stock"),
        "low_stock_count": sum(1 for a in alerts if a["severity"] == "low"),
        "auto_added_to_grocery": auto_added,
    }


# ──────────────────────────────────────────────
# Engine 2: "What Can I Cook Today?"
# ──────────────────────────────────────────────

def suggest_cookable_recipes(
    db: Session,
    household_id: str,
) -> Dict[str, Any]:
    """
    Matches pantry stock against seeded recipe templates.
    Filters by household dietary constraints. Sorted by coverage descending.
    """
    # 1. Build pantry snapshot (name → qty)
    pantry_items = db.query(PantryItem).filter(
        PantryItem.household_id == household_id
    ).all()
    pantry_map: Dict[str, float] = {}
    for pi in pantry_items:
        pantry_map[pi.item_name.lower().strip()] = pi.quantity

    # 2. Gather household dietary constraints
    members = db.query(HouseholdMember).filter(
        HouseholdMember.household_id == household_id
    ).all()

    household_diets = set()
    household_allergies: set = set()
    for m in members:
        if m.dietary_preference and m.dietary_preference != "any":
            household_diets.add(m.dietary_preference.lower())
        if m.allergies:
            for a in m.allergies:
                household_allergies.add(a.lower())

    has_vegetarian = "vegetarian" in household_diets or "vegan" in household_diets

    # 3. Score each recipe
    suggestions: List[Dict[str, Any]] = []
    skipped: List[Dict[str, str]] = []

    for recipe in RECIPE_TEMPLATES:
        # Dietary filter: skip non-veg if any member is vegetarian
        if has_vegetarian and recipe["diet"] == "non-veg":
            skipped.append({
                "recipe": recipe["name"],
                "reason": "Household has vegetarian member(s)",
            })
            continue

        # Allergen filter
        recipe_allergens = {a.lower() for a in recipe.get("allergens", [])}
        allergen_conflict = recipe_allergens & household_allergies
        if allergen_conflict:
            skipped.append({
                "recipe": recipe["name"],
                "reason": f"Contains allergen(s): {', '.join(allergen_conflict)}",
            })
            continue

        # Coverage calculation
        total_ingredients = len(recipe["ingredients"])
        matched = 0
        missing_items: List[Dict[str, Any]] = []

        for ing in recipe["ingredients"]:
            ing_name = ing["name"].lower().strip()
            pantry_qty = pantry_map.get(ing_name, 0.0)
            if pantry_qty >= ing["qty"]:
                matched += 1
            else:
                deficit = round(ing["qty"] - pantry_qty, 2)
                missing_items.append({
                    "name": ing["name"],
                    "needed": ing["qty"],
                    "have": pantry_qty,
                    "deficit": deficit,
                    "unit": ing["unit"],
                })

        coverage_pct = round((matched / total_ingredients) * 100, 1) if total_ingredients > 0 else 0.0

        suggestions.append({
            "name": recipe["name"],
            "tag": recipe["tag"],
            "diet": recipe["diet"],
            "coverage_pct": coverage_pct,
            "total_ingredients": total_ingredients,
            "matched_ingredients": matched,
            "missing_items": missing_items,
            "can_cook_now": coverage_pct == 100.0,
        })

    # Sort by coverage descending
    suggestions.sort(key=lambda x: x["coverage_pct"], reverse=True)

    return {
        "suggestions": suggestions,
        "total_recipes": len(suggestions),
        "cookable_now": sum(1 for s in suggestions if s["can_cook_now"]),
        "skipped_recipes": skipped,
    }


# ──────────────────────────────────────────────
# Engine 3: Household Nutrition Balance Insights
# ──────────────────────────────────────────────

def compute_nutrition_insights(
    db: Session,
    household_id: str,
) -> Dict[str, Any]:
    """
    Aggregates household members' nutrition targets, dietary preferences,
    and allergen constraints into a unified insights view.
    """
    members = db.query(HouseholdMember).filter(
        HouseholdMember.household_id == household_id
    ).all()

    member_breakdown: List[Dict[str, Any]] = []
    total_calories = 0
    total_protein = 0
    all_allergies: set = set()
    all_diets: set = set()

    for m in members:
        cal = m.calorie_target or 0
        prot = m.protein_target or 0
        total_calories += cal
        total_protein += prot

        if m.allergies:
            for a in m.allergies:
                all_allergies.add(a)

        diet = m.dietary_preference or "any"
        if diet != "any":
            all_diets.add(diet)

        member_breakdown.append({
            "id": m.id,
            "name": m.name,
            "dietary_preference": diet,
            "allergies": m.allergies or [],
            "calorie_target": cal,
            "protein_target": prot,
            "has_targets": cal > 0 or prot > 0,
        })

    # Detect dietary conflicts
    dietary_conflicts: List[str] = []
    diet_set = {m["dietary_preference"] for m in member_breakdown if m["dietary_preference"] != "any"}
    if "vegetarian" in diet_set or "vegan" in diet_set:
        non_veg_members = [m["name"] for m in member_breakdown if m["dietary_preference"] == "any"]
        veg_members = [m["name"] for m in member_breakdown if m["dietary_preference"] in ("vegetarian", "vegan")]
        if non_veg_members and veg_members:
            dietary_conflicts.append(
                f"{', '.join(veg_members)} follow a vegetarian/vegan diet, "
                f"while {', '.join(non_veg_members)} eat non-veg. "
                f"Cook separate proteins or choose veg recipes for shared meals."
            )

    return {
        "total_members": len(members),
        "total_household_calories": total_calories,
        "total_household_protein": total_protein,
        "member_breakdown": member_breakdown,
        "combined_allergies": sorted(all_allergies),
        "dietary_preferences": sorted(all_diets),
        "dietary_conflicts": dietary_conflicts,
    }


# ──────────────────────────────────────────────
# Engine 4: Grocery Grouping & Priority
# ──────────────────────────────────────────────

def group_grocery_items(
    db: Session,
    household_id: str,
) -> Dict[str, Any]:
    """
    Groups unpurchased grocery items by category and assigns priority scores.
    """
    from backend.grocery.models import GroceryList as GL, GroceryListItem as GLI

    active_list = _get_or_create_grocery_list(db, household_id)

    unpurchased = db.query(GLI).filter(
        GLI.grocery_list_id == active_list.id,
        GLI.is_purchased == False
    ).all()

    if not unpurchased:
        return {
            "groups": [],
            "total_items": 0,
            "high_priority_count": 0,
        }

    # Build low-stock names for priority boosting
    pantry_items = db.query(PantryItem).filter(
        PantryItem.household_id == household_id
    ).all()
    low_stock_names: set = set()
    for pi in pantry_items:
        if pi.min_threshold and pi.min_threshold > 0 and pi.quantity < pi.min_threshold:
            low_stock_names.add(pi.item_name.lower().strip())

    # Group items
    from collections import defaultdict
    import datetime

    groups_map: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    group_priorities: Dict[str, int] = defaultdict(int)
    high_priority_count = 0

    now = datetime.datetime.utcnow()

    for item in unpurchased:
        category = _classify_item(item.item_name)
        item_priority = 0

        # Priority: matches pantry low-stock → +3
        if item.item_name.lower().strip() in low_stock_names:
            item_priority += 3

        # Priority: stale (added > 2 days ago) → +1
        if item.added_at and (now - item.added_at).days >= 2:
            item_priority += 1

        if item_priority >= 3:
            priority_label = "urgent"
            high_priority_count += 1
        elif item_priority >= 1:
            priority_label = "soon"
        else:
            priority_label = "optional"

        groups_map[category].append({
            "id": item.id,
            "item_name": item.item_name,
            "quantity": item.quantity,
            "unit": item.unit,
            "priority": priority_label,
            "priority_score": item_priority,
            "added_at": item.added_at.isoformat() if item.added_at else None,
        })
        group_priorities[category] += item_priority

    # Build sorted response
    groups = []
    for cat, items in groups_map.items():
        items.sort(key=lambda x: x["priority_score"], reverse=True)
        groups.append({
            "category": cat,
            "priority_score": group_priorities[cat],
            "items": items,
            "item_count": len(items),
        })
    groups.sort(key=lambda x: x["priority_score"], reverse=True)

    return {
        "groups": groups,
        "total_items": len(unpurchased),
        "high_priority_count": high_priority_count,
    }


# ──────────────────────────────────────────────
# Internal Helpers
# ──────────────────────────────────────────────

def _get_or_create_grocery_list(db: Session, household_id: str) -> GroceryList:
    """Finds or creates the active grocery list for the household."""
    active_list = db.query(GroceryList).filter(
        GroceryList.household_id == household_id
    ).first()
    if not active_list:
        list_id = f"list_{secrets.token_hex(4)}"
        active_list = GroceryList(
            id=list_id,
            household_id=household_id,
            name="Shopping List",
        )
        db.add(active_list)
        db.commit()
        db.refresh(active_list)
    return active_list
