"""
Kitchen Template — Pre-populated Indian kitchen items for quick-stock onboarding.
Each item has a name, category, and optional bulk flag.
"""
from typing import List, Dict, Any

KITCHEN_TEMPLATE: List[Dict[str, Any]] = [
    # Staples
    {"name": "Rice", "category": "Staples", "is_bulk": True},
    {"name": "Atta", "category": "Staples", "is_bulk": True},
    {"name": "Toor Dal", "category": "Staples", "is_bulk": True},
    {"name": "Moong Dal", "category": "Staples", "is_bulk": True},
    {"name": "Poha", "category": "Staples"},
    {"name": "Oats", "category": "Staples"},
    {"name": "Maida", "category": "Staples", "is_bulk": True},
    {"name": "Sugar", "category": "Staples", "is_bulk": True},
    # Bakery
    {"name": "Bread", "category": "Bakery"},
    # Dairy
    {"name": "Milk", "category": "Dairy"},
    {"name": "Curd", "category": "Dairy"},
    {"name": "Paneer", "category": "Dairy"},
    {"name": "Butter", "category": "Dairy"},
    {"name": "Cheese", "category": "Dairy"},
    {"name": "Cream", "category": "Dairy"},
    {"name": "Ghee", "category": "Dairy", "is_bulk": True},
    # Proteins
    {"name": "Eggs", "category": "Proteins"},
    {"name": "Chicken", "category": "Proteins"},
    {"name": "Fish", "category": "Proteins"},
    {"name": "Tofu", "category": "Proteins"},
    {"name": "Soya Chunks", "category": "Proteins"},
    # Vegetables
    {"name": "Onion", "category": "Vegetables", "is_bulk": True},
    {"name": "Tomato", "category": "Vegetables"},
    {"name": "Potato", "category": "Vegetables", "is_bulk": True},
    {"name": "Capsicum", "category": "Vegetables"},
    {"name": "Carrot", "category": "Vegetables"},
    {"name": "Green Chilli", "category": "Vegetables"},
    {"name": "Cauliflower", "category": "Vegetables"},
    {"name": "Spinach", "category": "Vegetables"},
    {"name": "Ginger", "category": "Vegetables", "is_bulk": True},
    {"name": "Garlic", "category": "Vegetables", "is_bulk": True},
    {"name": "Lemon", "category": "Vegetables"},
    {"name": "Banana", "category": "Vegetables"},
    # Spices & Oils
    {"name": "Oil", "category": "Spices", "is_bulk": True},
    {"name": "Salt", "category": "Spices", "is_bulk": True},
    {"name": "Turmeric", "category": "Spices", "is_bulk": True},
    {"name": "Cumin", "category": "Spices", "is_bulk": True},
    {"name": "Chilli Powder", "category": "Spices", "is_bulk": True},
    {"name": "Garam Masala", "category": "Spices", "is_bulk": True},
    {"name": "Mustard Seeds", "category": "Spices", "is_bulk": True},
    {"name": "Coriander Powder", "category": "Spices", "is_bulk": True},
    {"name": "Peanuts", "category": "Staples"},
    {"name": "Peanut Butter", "category": "Staples"},
]

# Category-based expiry defaults (in days from added_at)
# Only perishable categories have defaults; staples/spices are non-perishable
EXPIRY_DEFAULTS_DAYS: Dict[str, int] = {
    "Dairy": 4,
    "Proteins": 2,
    "Bakery": 4,
    "Vegetables": 5,
    # Staples, Spices, Other → no expiry (return None)
}


def get_category_default_expiry_days(category: str) -> int | None:
    """Returns the default expiry window in days for a category, or None if non-perishable."""
    return EXPIRY_DEFAULTS_DAYS.get(category)
