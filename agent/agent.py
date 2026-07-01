from typing import Any, Dict
from mcp.mcp_client import SwiggyFoodMCPClient
from mcp.mcp_mock import MockSwiggyFoodMCP
from agent.memory import UserMemoryManager
from agent.personalization import PersonalizationEngine
from agent.pipeline import NutriOrderPipeline
from agent.resilience import place_order_safely

class NutriOrderAgent:
    def __init__(self, settings: Any) -> None:
        self.settings = settings
        self.mcp = self._build_mcp_client()
        self.memory = UserMemoryManager()
        self.personalization = PersonalizationEngine()
        self.pipeline = NutriOrderPipeline(
            mcp_client=self.mcp,
            memory_manager=self.memory,
            personalization_engine=self.personalization
        )

    def _build_mcp_client(self) -> Any:
        if self.settings.use_mock_mcp:
            return MockSwiggyFoodMCP()
        return SwiggyFoodMCPClient(
            base_url=self.settings.swiggy_base_url,
            token=self.settings.swiggy_token,
        )

    def recommend_meal(
        self,
        user_goal: str,
        protein_target_g: int,
        budget_max_rs: int,
        max_delivery_time_min: int,
        dietary_preference: str,
    ) -> Dict[str, Any]:
        """Wrapper method that forwards request to the pipeline running recommendations."""
        session_constraints = {
            "user_goal": user_goal,
            "protein_target_g": protein_target_g,
            "budget_max_rs": budget_max_rs,
            "max_delivery_time_min": max_delivery_time_min,
            "dietary_preference": dietary_preference,
            "preferences": []
        }
        # Run pipeline with the user query
        return self.pipeline.run_pipeline(user_goal, session_constraints)

    def confirm_order(self, latest_result: Dict[str, Any]) -> Dict[str, Any]:
        """Safety-wrapped order confirmation utilizing status checks to prevent duplicate placement."""
        if not latest_result.get("success"):
            return {"success": False, "message": "No valid recommendation is available to confirm."}

        rec = latest_result["recommendation"]

        # Call safety placing wrapper
        def place_fn():
            return self.mcp.place_food_order(user_confirmed=True)

        def check_fn():
            # In mock or real, get recent active orders
            try:
                orders_res = self.mcp.get_food_orders()
                # Sort out or list dicts
                return orders_res if isinstance(orders_res, list) else []
            except NotImplementedError:
                # If real client fails stub check
                return []
            except Exception:
                return []

        # Safely execute
        order_response = place_order_safely(place_order_fn=place_fn, check_status_fn=check_fn)
        
        if not order_response.get("success"):
            return order_response

        # Save order to personalization history upon success
        self.personalization.record_order(
            restaurant_id=rec.get("restaurant_id", "unknown"),
            restaurant_name=rec.get("restaurant_name", "unknown"),
            item_id=rec.get("item_id", "unknown"),
            item_name=rec.get("item_name", "unknown"),
            price=float(rec.get("price", 0.0))
        )

        tracking = {}
        try:
            order_id = order_response.get("order_id")
            if order_id:
                tracking = self.mcp.track_food_order(order_id)
        except Exception:
            pass

        return {
            "success": True,
            "message": order_response.get("message", "Order placed successfully."),
            "order": order_response,
            "tracking": tracking,
            "mock_mode": self.settings.use_mock_mcp
        }
