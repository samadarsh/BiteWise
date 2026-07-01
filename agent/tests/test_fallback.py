from agent.pipeline import NutriOrderPipeline
from mcp.mcp_mock import MockSwiggyFoodMCP
from agent.memory import UserMemoryManager
from agent.personalization import PersonalizationEngine

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
