from typing import Any, Dict, List, Optional

class MockSwiggyInstamartMCP:
    """
    Mock implementation of Swiggy Instamart MCP tools.
    Provides read-only preview/simulation methods to align with Swiggy Builders docs.
    """
    _carts_by_user: Dict[str, Dict[str, Any]] = {}
    _orders_by_user: Dict[str, List[Dict[str, Any]]] = {}

    @classmethod
    def clear_mock_user_data(cls, user_id: str) -> None:
        """Clears memory cart and orders for the demo user."""
        cls._carts_by_user.pop(user_id, None)
        cls._orders_by_user.pop(user_id, None)

    def __init__(self, user_id: str = "demo_user") -> None:
        self.user_id = user_id
        if user_id not in self._carts_by_user:
            self._carts_by_user[user_id] = {
                "items": [],
                "total": 0.0,
                "items_count": 0
            }
        if user_id not in self._orders_by_user:
            self._orders_by_user[user_id] = []
        self._cart = self._carts_by_user[user_id]
        self._orders = self._orders_by_user[user_id]

        self._catalog = [
            {"id": "im_1", "name": "Nandini Fresh Milk 1L", "price": 46.0, "category": "Dairy"},
            {"id": "im_2", "name": "Eggoz White Eggs 6pcs", "price": 55.0, "category": "Eggs & Meat"},
            {"id": "im_3", "name": "India Gate Basmati Rice 1kg", "price": 110.0, "category": "Staples"},
            {"id": "im_4", "name": "Fresh Chicken Breast Boneless 500g", "price": 220.0, "category": "Eggs & Meat"},
            {"id": "im_5", "name": "Fresh Lemon 4pcs", "price": 20.0, "category": "Fruits & Vegetables"},
            {"id": "im_6", "name": "Epigamia Greek Yogurt Blueberries 90g", "price": 60.0, "category": "Dairy"},
            {"id": "im_7", "name": "Amul Masti Dahi 400g", "price": 35.0, "category": "Dairy"},
            {"id": "im_8", "name": "Fresh Palak (Spinach) 250g", "price": 18.0, "category": "Fruits & Vegetables"},
            {"id": "im_9", "name": "Hybrid Tomato 500g", "price": 25.0, "category": "Fruits & Vegetables"},
            {"id": "im_10", "name": "Britannia Whole Wheat Bread 400g", "price": 50.0, "category": "Bakery"},
        ]

    def search_products(self, query: str) -> List[Dict[str, Any]]:
        """Mock search_products(query)"""
        clean_q = query.lower().strip()
        results = []
        for prod in self._catalog:
            if clean_q in prod["name"].lower() or prod["category"].lower() in clean_q:
                results.append(prod)
        return results

    def update_cart(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Mock update_cart(items) - simulated"""
        self._cart["items"] = items
        self._cart["items_count"] = sum(item.get("quantity", 1) for item in items)
        
        # Calculate total price
        total = 0.0
        for item in items:
            prod_id = item.get("id")
            qty = item.get("quantity", 1)
            prod = next((p for p in self._catalog if p["id"] == prod_id), None)
            price = prod["price"] if prod else 50.0
            total += price * qty
        self._cart["total"] = total
        return self._cart

    def get_cart(self) -> Dict[str, Any]:
        """Mock get_cart()"""
        return self._cart

    def clear_cart(self) -> Dict[str, Any]:
        """Mock clear_cart()"""
        self._cart["items"] = []
        self._cart["items_count"] = 0
        self._cart["total"] = 0.0
        return self._cart

    def your_go_to_items(self) -> List[Dict[str, Any]]:
        """Mock your_go_to_items()"""
        return [self._catalog[0], self._catalog[1], self._catalog[4]]
