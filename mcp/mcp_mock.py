class MockSwiggyFoodMCP:
    def __init__(self) -> None:
        self._cart = {"restaurant_id": None, "items": []}
        self._orders: dict[str, dict] = {}
        self._restaurants = [
            {
                "id": "rest_1",
                "name": "Protein Bowl Co",
                "delivery_time_min": 28,
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

    def get_addresses(self) -> list[dict]:
        return [
            {
                "id": "addr_home",
                "label": "Home",
                "display_text": "Bengaluru Home Address",
            }
        ]

    def search_restaurants(self, address_id: str = None, query: str = None, addressId: str = None) -> list[dict]:
        addr = addressId or address_id
        _ = addr
        _ = query
        return [
            {
                "id": restaurant["id"],
                "name": restaurant["name"],
                "delivery_time_min": restaurant["delivery_time_min"],
                "rating": restaurant.get("rating", 4.3),
                "availabilityStatus": "OPEN"
            }
            for restaurant in self._restaurants
        ]

    def get_restaurant_menu(self, restaurant_id: str = None, restaurantId: str = None) -> list[dict]:
        rest_id = restaurantId or restaurant_id
        for restaurant in self._restaurants:
            if restaurant["id"] == rest_id:
                return restaurant["menu"]
        return []

    def search_menu(self, *args, **kwargs) -> list[dict]:
        # Handle both signatures:
        # 1. search_menu(restaurant_id, query)
        # 2. search_menu(addressId, query, vegFilter=0, ...)
        restaurant_id = kwargs.get("restaurant_id")
        address_id = kwargs.get("addressId") or kwargs.get("address_id")
        query = kwargs.get("query")
        veg_filter = kwargs.get("vegFilter", 0)

        # Handle positional args if any
        if args:
            if len(args) == 2:
                if str(args[0]).startswith("rest_"):
                    restaurant_id = args[0]
                    query = args[1]
                else:
                    address_id = args[0]
                    query = args[1]
            elif len(args) == 1:
                query = args[0]

        normalized_query = query.lower() if query else ""

        results = []
        if restaurant_id:
            for item in self.get_restaurant_menu(restaurant_id):
                if normalized_query in item["name"].lower():
                    results.append(item)
        else:
            for rest in self._restaurants:
                for item in rest["menu"]:
                    if normalized_query in item["name"].lower():
                        if veg_filter == 1 and item.get("dietary_preference") != "veg":
                            continue
                        item_copy = dict(item)
                        item_copy["restaurant_id"] = rest["id"]
                        item_copy["restaurant_name"] = rest["name"]
                        item_copy["delivery_time_min"] = rest["delivery_time_min"]
                        item_copy["availabilityStatus"] = "OPEN"
                        results.append(item_copy)
        return results

    def update_food_cart(self, restaurant_id: str = None, items: list[dict] = None, restaurantId: str = None) -> dict:
        rest_id = restaurantId or restaurant_id
        self._cart = {
            "restaurant_id": rest_id,
            "items": items,
            "message": "Mock cart updated successfully.",
        }
        return dict(self._cart)

    def get_food_cart(self) -> dict:
        return dict(self._cart)

    def place_food_order(self, user_confirmed: bool) -> dict:
        if not user_confirmed:
            return {
                "success": False,
                "message": "Mock order was not placed because user confirmation was missing.",
            }

        if not self._cart["items"]:
            return {
                "success": False,
                "message": "Mock order was not placed because the cart is empty.",
            }

        order_id = f"mock_order_{len(self._orders) + 1}"
        order = {
            "success": True,
            "order_id": order_id,
            "status": "confirmed",
            "message": "Mock order confirmed. No real Swiggy order was placed.",
            "cart": dict(self._cart),
        }
        self._orders[order_id] = order
        return order

    def track_food_order(self, order_id: str = None, orderId: str = None) -> dict:
        ord_id = orderId or order_id
        order = self._orders.get(ord_id)
        if not order:
            return {
                "success": False,
                "message": "Mock order not found.",
                "order_id": ord_id,
            }
        return {
            "success": True,
            "order_id": ord_id,
            "status": order["status"],
            "message": "Mock tracking response. No real delivery is in progress.",
        }
