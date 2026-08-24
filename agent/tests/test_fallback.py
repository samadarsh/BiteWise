from agent.pipeline import NutriOrderPipeline
from mcp.mcp_mock import MockSwiggyFoodMCP
from agent.memory import UserMemoryManager
from agent.personalization import PersonalizationEngine
from agent.ranking import RankingEngine

class MockSettings:
    use_mock_mcp = True
    swiggy_base_url = "https://mcp.swiggy.com/food"
    swiggy_token = "mock"

def test_pipeline_fallback():
    # Set up mock pipeline elements
    mcp_client = MockSwiggyFoodMCP()
    memory = UserMemoryManager()
    personalization = PersonalizationEngine()
    pipeline = NutriOrderPipeline(mcp_client, memory, personalization)

    session_constraints = {
        "protein_target_g": 30,
        "budget_max_rs": 100,  # Impossible budget to force fallback or relaxation!
        "max_delivery_time_min": 45,
        "dietary_preference": "any",
        "preferences": []
    }

    # Query for "something_impossible" to trigger search_menu missing and falling back
    res = pipeline.run_pipeline("impossible_meal_query", session_constraints)
    
    # The pipeline should try search_menu, fallback to search_restaurants, and then relax constraints.
    # It should still find food (since fallback 2 queries generic "protein")
    assert res["success"] is True
    assert len(res["fallback_warnings"]) > 0
    # Let's verify that the constraints budget was indeed relaxed in the profile
    assert res["constraints"]["typical_budget"] > 100


class StubMcpNoMenuResults:
    """search_menu always empty, forcing fallback-1 (search_restaurants +
    get_restaurant_menu), returning real (non-mock) Swiggy field shapes —
    confirmed live: deliveryTimeMinutes, distanceKm, avgRating, isVeg."""

    def search_menu(self, addressId, query, restaurantIdOfAddedItem=None, vegFilter=None, offset=None):
        return []

    def search_restaurants(self, addressId, query, offset=None):
        return [
            {
                "id": "199095", "name": "Ss Hyderabad Biryani",
                "avgRating": 4.4, "distanceKm": 3.0, "deliveryTimeMinutes": 15,
                "deliveryTimeRange": "10-20 MINS", "availabilityStatus": "OPEN",
            }
        ]

    def get_restaurant_menu(self, addressId, restaurantId, page=None, pageSize=None):
        return [
            {"id": "43287374", "name": "Chicken Biryani", "price": 350, "inStock": 1, "isVeg": False, "hasVariants": False, "hasAddons": False},
        ]

    def get_addresses(self):
        return [{"id": "addr_home", "label": "Home"}]


def test_fallback1_uses_real_field_names_not_fake_defaults():
    """Regression: fallback-1 used to read delivery_time_min/distance_km/
    rating — none of which exist under those names on a real
    search_restaurants response — so every real item silently got a fake
    30 min / 2.5 km / 4.2-star default instead of the real data."""
    pipeline = NutriOrderPipeline(StubMcpNoMenuResults(), UserMemoryManager(), PersonalizationEngine())
    profile = {"typical_budget": 300, "max_delivery_time_min": 45, "dietary_preference": "any", "query": "biryani"}
    candidates, warnings = pipeline._generate_candidates_with_fallback(profile)

    assert len(candidates) == 1
    c = candidates[0]
    assert c["delivery_time_min"] == 15
    assert c["distance_km"] == 3.0
    assert c["rating"] == 4.4
    assert c["dietary_preference"] == "non-veg"
    assert c["availabilityStatus"] == "OPEN"


def test_primary_path_honestly_reports_missing_logistics_not_fake_defaults():
    """search_menu items carry no delivery-time/distance/availability signal
    at all — must come through as None (honest), not a fabricated 30
    min / 2.5 km / OPEN, and ranking must not crash on the Nones."""
    pipeline = NutriOrderPipeline(mcp_client=None, memory_manager=None, personalization_engine=None)
    real_items = [
        {"name": "Chicken Biryani", "price": 350, "menu_item_id": "m1", "restaurant_id": "r1", "restaurant_name": "SS Hyderabad Biryani", "rating": "4.4"},
    ]
    candidates = pipeline._convert_mcp_items(real_items)
    assert candidates[0]["delivery_time_min"] is None
    assert candidates[0]["distance_km"] is None
    assert candidates[0]["availabilityStatus"] is None

    profile = {
        "target_protein": 35, "target_calories": 650, "dietary_preference": "any",
        "typical_budget": 300, "max_delivery_time_min": 45, "allergies": [], "dislikes": [], "fitness_goal": "maintenance",
    }
    ranked = RankingEngine().rank_meals(candidates, profile)
    assert len(ranked) == 1
    assert ranked[0]["score"] > 0


class StubMetadataMcp:
    """Stub for the real-mode-only restaurant-status verification step."""

    def __init__(self, restaurant_meta_by_id):
        self._meta = restaurant_meta_by_id

    def get_restaurant_menu_with_metadata(self, addressId, restaurantId):
        if restaurantId not in self._meta:
            raise Exception(f"unknown restaurant {restaurantId}")
        return {"restaurant": self._meta[restaurantId], "items": []}


def _set_real_mode():
    import os
    original = os.environ.get("USE_MOCK_MCP")
    os.environ["USE_MOCK_MCP"] = "false"
    return original


def _restore_mock_mode(original):
    import os
    if original is not None:
        os.environ["USE_MOCK_MCP"] = original
    else:
        os.environ.pop("USE_MOCK_MCP", None)


def test_enrich_filters_confirmed_closed_restaurant():
    """A restaurant search_menu never told us was closed must not survive
    once we actually check — this is the fix for restaurants showing as
    recommendable at 1:30 AM when they're not really open."""
    original = _set_real_mode()
    try:
        mcp = StubMetadataMcp({"r_closed": {"isOpen": False, "avgRating": 4.0, "deliveryTime": 20}})
        pipeline = NutriOrderPipeline(mcp, UserMemoryManager(), PersonalizationEngine())
        candidates = [{"restaurant_id": "r_closed", "item_name": "Late Night Biryani", "rating": None, "delivery_time_min": None, "availabilityStatus": None}]
        result = pipeline._enrich_and_filter_by_restaurant_status(candidates, "addr_home")
        assert result == []
    finally:
        _restore_mock_mode(original)


def test_enrich_filters_restaurant_with_isOpen_key_entirely_absent():
    """Confirmed live: Swiggy never sends isOpen: false for a closed
    restaurant — it just omits the key (open restaurants get isOpen: true
    explicitly; a closed one, checked live, returned no isOpen field and no
    per-item inStock at all). A naive "is False" check never matches this,
    which is exactly why closed restaurants kept appearing."""
    original = _set_real_mode()
    try:
        # No "isOpen" key at all — the actual shape Swiggy sends for a closed restaurant.
        mcp = StubMetadataMcp({"r_closed": {"avgRating": 4.5, "deliveryTime": 25}})
        pipeline = NutriOrderPipeline(mcp, UserMemoryManager(), PersonalizationEngine())
        candidates = [{"restaurant_id": "r_closed", "item_name": "Grilled Chicken Wings", "rating": None, "delivery_time_min": None, "availabilityStatus": None}]
        result = pipeline._enrich_and_filter_by_restaurant_status(candidates, "addr_home")
        assert result == []
    finally:
        _restore_mock_mode(original)


def test_enrich_fills_real_rating_and_delivery_time_for_open_restaurant():
    original = _set_real_mode()
    try:
        mcp = StubMetadataMcp({"r_open": {"isOpen": True, "avgRating": 4.6, "deliveryTime": 22}})
        pipeline = NutriOrderPipeline(mcp, UserMemoryManager(), PersonalizationEngine())
        candidates = [{"restaurant_id": "r_open", "item_name": "Chicken Biryani", "rating": None, "delivery_time_min": None, "availabilityStatus": None}]
        result = pipeline._enrich_and_filter_by_restaurant_status(candidates, "addr_home")
        assert len(result) == 1
        assert result[0]["rating"] == 4.6
        assert result[0]["delivery_time_min"] == 22
        assert result[0]["availabilityStatus"] == "OPEN"
    finally:
        _restore_mock_mode(original)


def test_enrich_skipped_entirely_in_mock_mode():
    """Mock fixtures already carry honest per-item data — must not even
    attempt the real-mode-only lookup (which the mock client doesn't have)."""
    pipeline = NutriOrderPipeline(mcp_client=None, memory_manager=None, personalization_engine=None)
    candidates = [{"restaurant_id": "r1", "item_name": "Anything", "rating": None}]
    result = pipeline._enrich_and_filter_by_restaurant_status(candidates, "addr_home")
    assert result == candidates


def test_enrich_fails_open_when_status_lookup_errors():
    """A glitchy metadata lookup must never hide an item we simply couldn't
    verify — only a positive isOpen: false confirmation removes it."""
    original = _set_real_mode()
    try:
        mcp = StubMetadataMcp({})  # every lookup raises
        pipeline = NutriOrderPipeline(mcp, UserMemoryManager(), PersonalizationEngine())
        candidates = [{"restaurant_id": "r_unknown", "item_name": "Mystery Item", "rating": None, "delivery_time_min": None, "availabilityStatus": None}]
        result = pipeline._enrich_and_filter_by_restaurant_status(candidates, "addr_home")
        assert len(result) == 1
        assert result[0]["rating"] is None
    finally:
        _restore_mock_mode(original)
