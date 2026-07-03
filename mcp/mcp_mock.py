from typing import Any, Dict, List, Optional
from mcp.mcp_client import SwiggyMCPError, SwiggyAuthError

class MockSwiggyFoodMCP:
    _carts_by_user: Dict[str, Dict[str, Any]] = {}
    _orders_by_user: Dict[str, Dict[str, Dict[str, Any]]] = {}

    @classmethod
    def clear_mock_user_data(cls, user_id: str) -> None:
        """Clears memory cart and orders for the demo user."""
        cls._carts_by_user.pop(user_id, None)
        cls._orders_by_user.pop(user_id, None)

    def __init__(self, user_id: str = "demo_user") -> None:
        self.user_id = user_id
        if user_id not in self._carts_by_user:
            self._carts_by_user[user_id] = {
                "restaurantId": None,
                "cartItems": [],
                "restaurantName": None,
                "total": 0,
                "bill": {"total": 0},
            }
        if user_id not in self._orders_by_user:
            self._orders_by_user[user_id] = {}
        self._cart = self._carts_by_user[user_id]
        self._orders = self._orders_by_user[user_id]

        self._coupons = [
            {
                "code": "FITNEW50",
                "description": "50% off on all bowls",
                "discount_amount": 50,
                "requiresOnlinePayment": False
            },
            {
                "code": "GPAY100",
                "description": "Flat 100 off, GPay only",
                "discount_amount": 100,
                "requiresOnlinePayment": True
            },
            {
                "code": "NUTRI20",
                "description": "20% off on salads",
                "discount_amount": 20,
                "requiresOnlinePayment": False
            }
        ]

        self._restaurants = [
            {
                "id": "rest_1",
                "name": "Protein Bowl Co",
                "delivery_time_min": 28,
                "rating": 4.5,
                "distance_km": 2.1,
                "menu": [
                    {
                        "id": "item_1",
                        "name": "Grilled Chicken Rice Bowl",
                        "protein_g": 42,
                        "price": 289,
                        "dietary_preference": "non-veg",
                    },
                    {
                        "id": "item_2",
                        "name": "Paneer Power Bowl",
                        "protein_g": 31,
                        "price": 249,
                        "dietary_preference": "veg",
                    },
                ],
            },
            {
                "id": "rest_2",
                "name": "Lean Meal Hub",
                "delivery_time_min": 34,
                "rating": 4.2,
                "distance_km": 4.5,
                "menu": [
                    {
                        "id": "item_3",
                        "name": "Double Egg Wrap",
                        "protein_g": 24,
                        "price": 179,
                        "dietary_preference": "non-veg",
                    },
                    {
                        "id": "item_4",
                        "name": "Tofu Burrito Bowl",
                        "protein_g": 27,
                        "price": 219,
                        "dietary_preference": "veg",
                    },
                ],
            },
            {
                "id": "rest_3",
                "name": "Fit Feast Kitchen",
                "delivery_time_min": 41,
                "rating": 4.6,
                "distance_km": 6.2,
                "menu": [
                    {
                        "id": "item_5",
                        "name": "Peri Peri Chicken Salad",
                        "protein_g": 36,
                        "price": 299,
                        "dietary_preference": "non-veg",
                    },
                    {
                        "id": "item_6",
                        "name": "High Protein Soya Salad",
                        "protein_g": 29,
                        "price": 199,
                        "dietary_preference": "veg",
                    },
                ],
            },
        ]


    def get_addresses(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "addr_home",
                "label": "Home",
                "display_text": "123 Green Glen Layout, Outer Ring Road, Bengaluru",
            },
            {
                "id": "addr_office",
                "label": "Office",
                "display_text": "Swiggy HQ, Devarabeesanahalli, Bengaluru",
            }
        ]

    def search_restaurants(self, addressId: str, query: str, offset: Optional[int] = None) -> List[Dict[str, Any]]:
        _ = addressId
        normalized = query.lower() if query else ""
        if "impossible" in normalized:
            return []

        matches = []
        for rest in self._restaurants:
            # If empty query or keyword match, return it
            if not normalized or normalized in rest["name"].lower() or "protein" in normalized or "meal" in normalized or "chicken" in normalized or "salad" in normalized:
                matches.append({
                    "id": rest["id"],
                    "name": rest["name"],
                    "delivery_time_min": rest["delivery_time_min"],
                    "rating": rest.get("rating", 4.3),
                    "availabilityStatus": rest.get("availabilityStatus", "OPEN")
                })
        return matches

    def get_restaurant_menu(self, addressId: str, restaurantId: str, page: Optional[int] = None, pageSize: Optional[int] = None) -> List[Dict[str, Any]]:
        _ = addressId
        for restaurant in self._restaurants:
            if restaurant["id"] == restaurantId:
                return restaurant["menu"]
        return []

    def search_menu(self, addressId: str, query: str, restaurantIdOfAddedItem: Optional[str] = None, vegFilter: Optional[int] = None, offset: Optional[int] = None) -> List[Dict[str, Any]]:
        normalized_query = query.lower() if query else ""
        results = []

        for rest in self._restaurants:
            # If scoped to a specific restaurant
            if restaurantIdOfAddedItem and rest["id"] != restaurantIdOfAddedItem:
                continue

            for item in rest["menu"]:
                if normalized_query in item["name"].lower():
                    if vegFilter == 1 and item.get("dietary_preference") != "veg":
                        continue
                    item_copy = dict(item)
                    item_copy["restaurant_id"] = rest["id"]
                    item_copy["restaurant_name"] = rest["name"]
                    item_copy["delivery_time_min"] = rest["delivery_time_min"]
                    item_copy["distance_km"] = rest.get("distance_km", 2.5)
                    item_copy["availabilityStatus"] = rest.get("availabilityStatus", "OPEN")
                    results.append(item_copy)
        return results

    def update_food_cart(self, restaurantId: str, cartItems: List[Dict[str, Any]], addressId: str, restaurantName: Optional[str] = None) -> Dict[str, Any]:
        resolved_restaurant_name = restaurantName or "Mock Restaurant"
        item_lookup = {}
        for rest in self._restaurants:
            if rest["id"] == restaurantId:
                resolved_restaurant_name = restaurantName or rest["name"]
            for menu_item in rest["menu"]:
                item_lookup[menu_item["id"]] = menu_item

        total = 0
        enriched_items = []
        for cart_item in cartItems:
            item_id = cart_item.get("itemId")
            quantity = int(cart_item.get("quantity", 1) or 1)
            item_details = item_lookup.get(item_id, {})
            item_total = int(item_details.get("price", 0) or 0) * quantity
            total += item_total
            enriched_item = dict(cart_item)
            if item_details:
                enriched_item.update({
                    "name": item_details.get("name"),
                    "price": item_details.get("price"),
                    "lineTotal": item_total,
                })
            enriched_items.append(enriched_item)

        self._cart = {
            "restaurantId": restaurantId,
            "cartItems": enriched_items,
            "addressId": addressId,
            "restaurantName": resolved_restaurant_name,
            "total": total,
            "bill": {"total": total},
            "message": "Mock cart updated successfully."
        }
        self._carts_by_user[self.user_id] = self._cart
        return dict(self._cart)

    def get_food_cart(self, addressId: str, restaurantName: Optional[str] = None) -> Dict[str, Any]:
        _ = addressId
        _ = restaurantName
        return dict(self._cart)

    def fetch_food_coupons(self, restaurantId: str, addressId: str, couponCode: Optional[str] = None) -> List[Dict[str, Any]]:
        _ = restaurantId
        _ = addressId
        if couponCode:
            return [c for c in self._coupons if c["code"].upper() == couponCode.upper()]
        return self._coupons

    def apply_food_coupon(self, couponCode: str, addressId: str, cartId: Optional[str] = None) -> Dict[str, Any]:
        _ = addressId
        _ = cartId
        # Find coupon
        coupon = next((c for c in self._coupons if c["code"].upper() == couponCode.upper()), None)
        if not coupon:
            raise SwiggyMCPError("Coupon code is invalid.")

        # Update cart total with coupon discount
        discount = coupon["discount_amount"]
        original_total = self._cart.get("total", 0)
        new_total = max(0, original_total - discount)
        self._cart["total"] = new_total
        self._cart["applied_coupon"] = coupon["code"]
        self._cart["discount_amount"] = discount
        self._cart["bill"] = {
            "subtotal": original_total,
            "discount": discount,
            "total": new_total
        }
        self._carts_by_user[self.user_id] = self._cart

        return {
            "success": True,
            "message": f"Coupon {couponCode} applied successfully. Discount: Rs {discount}.",
            "cart": dict(self._cart)
        }


    def get_food_orders(self, addressId: str, orderCount: Optional[int] = None) -> List[Dict[str, Any]]:
        _ = addressId
        # Return registered mock orders sorted by creation time
        sorted_orders = sorted(self._orders.values(), key=lambda o: o.get("timestamp", 0), reverse=True)
        if orderCount:
            return sorted_orders[:orderCount]
        return sorted_orders

    def place_food_order(self, addressId: str, paymentMethod: Optional[str] = "COD") -> Dict[str, Any]:
        if not self._cart.get("cartItems"):
            raise SwiggyMCPError("Mock order was not placed because the cart is empty.")

        import time
        orderId = f"mock_order_{len(self._orders) + 1}"
        order = {
            "orderId": orderId,
            "status": "confirmed",
            "message": "Mock order confirmed. No real Swiggy order was placed.",
            "cart": dict(self._cart),
            "paymentMethod": paymentMethod,
            "addressId": addressId,
            "timestamp": time.time()
        }
        self._orders[orderId] = order
        return order

    def track_food_order(self, orderId: str) -> Dict[str, Any]:
        order = self._orders.get(orderId)
        if not order:
            raise SwiggyMCPError(f"Mock order not found: {orderId}")

        return {
            "orderId": orderId,
            "status": order["status"],
            "message": "Mock tracking response. No real delivery is in progress.",
        }
