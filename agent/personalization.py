import json
from pathlib import Path
from typing import Any, Dict, List
from collections import Counter
from datetime import datetime
from agent.observability import log_info, log_error

class PersonalizationEngine:
    def __init__(self, history_filepath: str = "outputs/order_history.json") -> None:
        self.filepath = Path(history_filepath)
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        self.history = self.load_history()

    def load_history(self) -> List[Dict[str, Any]]:
        if not self.filepath.exists():
            return []
        
        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                return []
        except Exception as e:
            log_error(f"Failed to load order history: {str(e)}", error_category="internal_error")
            return []

    def save_history(self) -> bool:
        try:
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(self.history, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            log_error(f"Failed to save order history: {str(e)}", error_category="internal_error")
            return False

    def record_order(self, restaurant_id: str, restaurant_name: str, item_id: str, item_name: str, price: float, cuisine: str = "unknown") -> None:
        # Determine meal type by time of day
        now = datetime.now()
        hour = now.hour
        if 5 <= hour < 11:
            meal_type = "breakfast"
        elif 11 <= hour < 16:
            meal_type = "lunch"
        elif 16 <= hour < 19:
            meal_type = "snack"
        elif 19 <= hour < 23:
            meal_type = "dinner"
        else:
            meal_type = "late_night"

        order = {
            "timestamp": now.isoformat(),
            "restaurant_id": restaurant_id,
            "restaurant_name": restaurant_name,
            "item_id": item_id,
            "item_name": item_name,
            "price": price,
            "cuisine": cuisine.lower(),
            "meal_type": meal_type,
            "hour": hour
        }

        self.history.append(order)
        self.save_history()
        log_info(f"Recorded order in personalization history: {item_name} from {restaurant_name}")

    def get_personalization_summary(self) -> Dict[str, Any]:
        """Aggregate order history to identify recurring user preferences."""
        if not self.history:
            return {
                "favorite_cuisines": [],
                "favorite_restaurants": [],
                "favorite_items": [],
                "average_spend": 0.0,
                "preferred_meal_type": "unknown",
                "total_orders": 0
            }

        cuisines = [o["cuisine"] for o in self.history if o.get("cuisine")]
        restaurants = [o["restaurant_id"] for o in self.history if o.get("restaurant_id")]
        items = [o["item_id"] for o in self.history if o.get("item_id")]
        prices = [o["price"] for o in self.history if o.get("price")]
        meal_types = [o["meal_type"] for o in self.history if o.get("meal_type")]

        cuisine_counts = Counter(cuisines)
        restaurant_counts = Counter(restaurants)
        item_counts = Counter(items)
        meal_type_counts = Counter(meal_types)

        avg_spend = sum(prices) / len(prices) if prices else 0.0

        # Sort by frequency
        fav_cuisines = [item for item, count in cuisine_counts.most_common(3)]
        fav_restaurants = [item for item, count in restaurant_counts.most_common(3)]
        fav_items = [item for item, count in item_counts.most_common(3)]
        pref_meal_type = meal_type_counts.most_common(1)[0][0] if meal_types else "unknown"

        return {
            "favorite_cuisines": fav_cuisines,
            "favorite_restaurants": fav_restaurants,
            "favorite_items": fav_items,
            "average_spend": round(avg_spend, 2),
            "preferred_meal_type": pref_meal_type,
            "total_orders": len(self.history)
        }
