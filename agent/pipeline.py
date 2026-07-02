import time
from typing import Any, Dict, List, Tuple, Optional
from agent.observability import log_info, log_warn, log_error, metrics_tracker
from agent.ranking import RankingEngine
from agent.caching import mcp_cache
from agent.resilience import retry_with_backoff

class NutriOrderPipeline:
    def __init__(self, mcp_client: Any, memory_manager: Any, personalization_engine: Any) -> None:
        self.mcp = mcp_client
        self.memory = memory_manager
        self.personalization = personalization_engine
        self.ranker = RankingEngine()

    def run_pipeline(
        self,
        raw_input: str,
        session_constraints: Dict[str, Any],
        address_id: Optional[str] = None,
        skip_cart_update: bool = False,
        custom_priorities: Optional[Dict[str, float]] = None,
        relaxation_patch: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Orchestrate the end-to-end recommendation pipeline."""
        start_time = time.time()
        metrics_tracker.reset()  # Reset for UI monitoring purposes if needed
        log_info(f"Starting recommendation pipeline. Input: '{raw_input}'")

        from mcp.mcp_client import SwiggyAuthError, SwiggyMCPError

        try:
            # Apply relaxation patch overrides if present
            if relaxation_patch:
                if "calorie_target" in relaxation_patch:
                    session_constraints["calorie_target"] = relaxation_patch["calorie_target"]
                if "protein_target" in relaxation_patch:
                    session_constraints["protein_target"] = relaxation_patch["protein_target"]
                if "budget_max_rs" in relaxation_patch:
                    session_constraints["budget_max_rs"] = relaxation_patch["budget_max_rs"]

            # Resolve address ID early (use passed value if present)
            address_id = address_id or session_constraints.get("addressId") or self._resolve_address_id()

            # Stage 1: Intent Parser (uses session inputs or regex if not LLM parsed)
            intent = self._parse_intent(raw_input, session_constraints)

            # Stage 2: Nutrition Planner (merges with user memory and history)
            planned_profile = self._plan_nutrition(intent)
            planned_profile["addressId"] = address_id

            # Stage 3: Candidate Generation & Fallback Management
            candidates, fallback_warnings = self._generate_candidates_with_fallback(planned_profile)

            # Stage 4: Constraint Validation (Allergies, Dislikes, hard constraints)
            valid_candidates = self._validate_constraints(candidates, planned_profile)

            # Stage 5: Ranking Engine (weighted multi-factor scores + explanations)
            ranked = self.ranker.rank_meals(valid_candidates, planned_profile, custom_priorities=custom_priorities)

            pipeline_duration = time.time() - start_time
            metrics_tracker.record_latency("recommendation_pipeline", pipeline_duration)
            log_info(f"Pipeline completed in {pipeline_duration:.2f}s. Candidates: {len(ranked)}")

            if not ranked:
                metrics_tracker.record_recommendation(success=False)
                return {
                    "success": False,
                    "message": "No meals matched your protein and dietary filters even after constraint relaxation.",
                    "fallback_warnings": fallback_warnings
                }

            if skip_cart_update:
                metrics_tracker.record_recommendation(success=True)
                return {
                    "success": True,
                    "constraints": planned_profile,
                    "recommendation": ranked[0],
                    "recommendations": ranked[:5],  # top 5 options
                    "cart_preview": None,
                    "cart_state": None,
                    "fallback_warnings": fallback_warnings,
                    "metrics": metrics_tracker.get_metrics_summary()
                }

            # Stage 6: Select Best Recommendation and generate cart preview
            best_meal = ranked[0]
            
            # Prepare mock/real cart (we try to call the MCP update_food_cart tool)
            cart_preview = None
            cart_state = None
            
            # We call caching or client directly using aligned Swiggy parameters
            cart_preview = self._execute_mcp_call(
                "update_food_cart",
                {
                    "restaurantId": best_meal["restaurant_id"], 
                    "cartItems": [{"itemId": best_meal["item_id"], "quantity": 1}],
                    "addressId": address_id,
                    "restaurantName": best_meal["restaurant_name"]
                }
            )
            cart_state = self._execute_mcp_call(
                "get_food_cart", 
                {
                    "addressId": address_id,
                    "restaurantName": best_meal["restaurant_name"]
                }
            )

            metrics_tracker.record_recommendation(success=True)
            return {
                "success": True,
                "constraints": planned_profile,
                "recommendation": best_meal,
                "recommendations": ranked[:5],  # top 5 options
                "cart_preview": cart_preview,
                "cart_state": cart_state,
                "fallback_warnings": fallback_warnings,
                "metrics": metrics_tracker.get_metrics_summary()
            }

        except SwiggyAuthError as e:
            log_error(f"Authentication error in pipeline: {str(e)}", error_category="unauthenticated")
            metrics_tracker.record_recommendation(success=False)
            return {
                "success": False,
                "auth_required": True,
                "message": f"Your Swiggy login session has expired. Please re-authenticate. (Details: {str(e)})"
            }
        except SwiggyMCPError as e:
            log_error(f"MCP error in pipeline: {str(e)}", error_category="upstream_error")
            metrics_tracker.record_recommendation(success=False)
            return {
                "success": False,
                "message": f"Swiggy API Error: {str(e)}"
            }
        except Exception as e:
            log_error(f"Unexpected error in pipeline: {str(e)}", error_category="internal_error")
            metrics_tracker.record_recommendation(success=False)
            return {
                "success": False,
                "message": f"An unexpected error occurred: {str(e)}"
            }

    def _parse_intent(self, raw_input: str, session_constraints: Dict[str, Any]) -> Dict[str, Any]:
        """Parses the raw text intent or uses pre-parsed constraints."""
        # Clean session constraints
        intent = {
            "query": raw_input or session_constraints.get("user_goal", "high protein"),
            "protein_goal": (
                session_constraints.get("protein_target_g")
                or session_constraints.get("protein_target")
                or session_constraints.get("protein_goal")
            ),
            "calorie_target": session_constraints.get("calorie_target") or session_constraints.get("target_calories"),
            "budget": session_constraints.get("budget_max_rs", 300),
            "delivery_time": session_constraints.get("max_delivery_time_min", 45),
            "preferences": session_constraints.get("preferences", []),
            "dietary_preference": session_constraints.get("dietary_preference", "any")
        }
        
        # Try to parse raw input keywords if user didn't fill form
        raw_lower = raw_input.lower()
        if "veg" in raw_lower and "non-veg" not in raw_lower:
            intent["dietary_preference"] = "veg"
        elif "non-veg" in raw_lower:
            intent["dietary_preference"] = "non-veg"
            
        return intent

    def _plan_nutrition(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        """Merges intent targets with user memory and order history."""
        # Get long-term preferences from memory manager
        profile = self.memory.get_merged_constraints(intent)
        
        # Get ordering pattern summaries from personalization
        history_summary = self.personalization.get_personalization_summary()
        profile["history_summary"] = history_summary
        
        # Calculate targets using biometric targets engine
        from agent.nutrition_targets import NutritionTargetEngine
        targets = NutritionTargetEngine.calculate_targets(profile)
        
        profile["target_calories"] = intent.get("calorie_target") or targets["meal_calories"]
        profile["target_protein"] = intent.get("protein_goal") or targets["meal_protein"]
        profile["daily_calories"] = targets["daily_calories"]
        profile["daily_protein"] = targets["daily_protein"]
        profile["goal_reason"] = targets["goal_reason"]

        # Propagate other limit constraints
        profile["max_delivery_time_min"] = intent.get("delivery_time", 45)
        profile["dietary_preference"] = intent.get("dietary_preference", profile.get("dietary_preference", "any"))

        return profile

    def _generate_candidates_with_fallback(self, profile: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Candidate generator with intelligent fallback logic."""
        address_id = profile.get("addressId") or self._resolve_address_id()
        query = profile.get("query", "meal")
        
        candidates: List[Dict[str, Any]] = []
        fallback_warnings = []
        
        # Primary search: search_menu (cross-restaurant dish search)
        log_info(f"Primary search: search_menu for '{query}'")
        try:
            menu_results = self._execute_mcp_call(
                "search_menu", 
                {"addressId": address_id, "query": query, "vegFilter": 1 if profile.get("dietary_preference") == "veg" else 0}
            )
            if menu_results:
                candidates = self._convert_mcp_items(menu_results)
                log_info(f"Primary search returned {len(candidates)} items.")
        except Exception as e:
            log_error(f"Primary search failed: {str(e)}", error_category="upstream_error")

        # Fallback 1: search_restaurants + local menu retrieval
        if not candidates:
            log_warn("Primary search yielded no candidates. Executing Fallback 1: search_restaurants + menus")
            fallback_warnings.append("No dishes matched your specific query directly. Searching relevant restaurants...")
            try:
                restaurants = self._execute_mcp_call(
                    "search_restaurants",
                    {"addressId": address_id, "query": query}
                )
                
                # Fetch menus for the top 3 restaurants
                top_restaurants = restaurants[:3] if isinstance(restaurants, list) else []
                for rest in top_restaurants:
                    menu = self._execute_mcp_call(
                        "get_restaurant_menu", 
                        {"addressId": address_id, "restaurantId": rest["id"]}
                    )
                    from agent.nutrition_estimator import NutritionEstimator
                    for item in menu:
                        item_name = item["name"]
                        desc = item.get("description") or item.get("item_description") or ""
                        est = NutritionEstimator.estimate_nutrition(item_name, desc)
                        
                        verified_protein = item.get("protein_g")
                        verified_cal = item.get("calories")
                        is_estimated = not (verified_protein and verified_cal)
                        
                        protein = verified_protein if verified_protein else est["estimated_protein_g"]
                        calories = verified_cal if verified_cal else est["estimated_calories"]
                        fat = item.get("fat_g") or est["estimated_fat_g"]
                        carbs = item.get("carbs_g") or est["estimated_carbs_g"]
                        confidence = 1.0 if not is_estimated else est["confidence"]

                        candidates.append({
                            "restaurant_id": rest["id"],
                            "restaurant_name": rest["name"],
                            "item_id": item["id"],
                            "item_name": item_name,
                            "protein_g": protein,
                            "calories": calories,
                            "fat_g": fat,
                            "carbs_g": carbs,
                            "confidence": confidence,
                            "is_estimated": is_estimated,
                            "price": item["price"],
                            "delivery_time_min": rest.get("delivery_time_min", 30),
                            "distance_km": rest.get("distance_km", 2.5),
                            "delivery_time_spoken": rest.get("deliveryTimeSpoken") or f"about {rest.get('delivery_time_min', 30)} minutes",
                            "short_description": item.get("shortDescription") or f"{item_name} from {rest['name']}. Estimated {protein} grams of protein and {calories} calories.",
                            "dietary_preference": item.get("dietary_preference", "any"),
                            "rating": rest.get("rating", 4.2),
                            "availabilityStatus": rest.get("availabilityStatus", "OPEN")
                        })
                log_info(f"Fallback 1 gathered {len(candidates)} candidates.")
            except Exception as e:
                log_error(f"Fallback 1 search failed: {str(e)}", error_category="upstream_error")

        # Fallback 2: Relax constraints gradually
        if not candidates:
            log_warn("No items found. Executing Fallback 2: Relaxing constraints...")
            fallback_warnings.append("Broadening search criteria to find available meals.")
            
            # Relax budget by 30% and delivery time to 60 minutes, search again
            original_budget = profile["typical_budget"]
            profile["typical_budget"] = int(original_budget * 1.3)
            profile["max_delivery_time_min"] = 60
            
            # Re-attempt broad search with generic keyword "protein" or "meal"
            try:
                fallback_results = self._execute_mcp_call(
                    "search_menu", 
                    {"addressId": address_id, "query": "protein", "vegFilter": 0}
                )
                if fallback_results:
                    candidates = self._convert_mcp_items(fallback_results)
                    fallback_warnings.append(
                        f"Budget constraint relaxed to Rs {profile['typical_budget']} "
                        f"and delivery limit extended to 60 minutes."
                    )
            except Exception as e:
                log_error(f"Fallback 2 search failed: {str(e)}", error_category="upstream_error")

        return candidates, fallback_warnings

    def _validate_constraints(self, candidates: List[Dict[str, Any]], profile: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Validate strict constraints such as restaurant open status and ₹1000 limit."""
        valid = []
        for c in candidates:
            # Check availability
            if c.get("availabilityStatus") and c["availabilityStatus"] not in ["OPEN", "open"]:
                continue
            
            # Hard limit: Swiggy MCP v1.0 has a ₹1000 order cap
            if c.get("price", 0) >= 1000:
                continue

            valid.append(c)
        return valid

    def _resolve_address_id(self) -> str:
        """Helper to get a valid address ID."""
        try:
            addresses = self._execute_mcp_call("get_addresses", {})
            if addresses and isinstance(addresses, list):
                return addresses[0]["id"]
        except Exception:
            pass
        return "addr_home"  # Fallback

    def _execute_mcp_call(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call MCP client with caching and retry decorators."""
        # 1. Check cache first
        cached_val = mcp_cache.get(tool_name, arguments)
        if cached_val is not None:
            return cached_val

        # Define the network calling function
        @retry_with_backoff(max_retries=3, initial_delay=0.3)
        def _call():
            start_mcp = time.time()
            metrics_tracker.record_tool_call(success=True)
            try:
                # Call tool dynamically
                method = getattr(self.mcp, tool_name)
                res = method(**arguments)
                duration = time.time() - start_mcp
                metrics_tracker.record_latency(f"mcp_{tool_name}", duration)
                return res
            except Exception as e:
                metrics_tracker.record_tool_call(success=False)
                raise e

        val = _call()
        
        # 2. Store to cache (menus: 30 min, searches: 5 min, addresses: 1 hour)
        ttl = 300.0  # default 5 minutes
        if tool_name == "get_restaurant_menu":
            ttl = 1800.0
        elif tool_name == "get_addresses":
            ttl = 3600.0
            
        mcp_cache.set(tool_name, arguments, val, ttl)
        return val

    def _convert_mcp_items(self, mcp_items: Any) -> List[Dict[str, Any]]:
        """Normalize items returned by mcp search_menu tool into candidate dicts."""
        from agent.nutrition_estimator import NutritionEstimator
        normalized = []
        if not isinstance(mcp_items, list):
            return normalized

        for item in mcp_items:
            item_name = item.get("name") or item.get("item_name") or "Recommended Item"
            desc = item.get("description") or item.get("item_description") or ""
            
            # Estimate macros
            est = NutritionEstimator.estimate_nutrition(item_name, desc)
            
            verified_protein = item.get("protein_g")
            verified_cal = item.get("calories")
            
            is_estimated = not (verified_protein and verified_cal)
            
            protein = verified_protein if verified_protein else est["estimated_protein_g"]
            calories = verified_cal if verified_cal else est["estimated_calories"]
            fat = item.get("fat_g") or est["estimated_fat_g"]
            carbs = item.get("carbs_g") or est["estimated_carbs_g"]
            confidence = 1.0 if not is_estimated else est["confidence"]
            
            normalized.append({
                "restaurant_id": item.get("restaurant_id", "rest_1"),
                "restaurant_name": item.get("restaurant_name", "Protein Bowl Co"),
                "item_id": item.get("id") or item.get("item_id"),
                "item_name": item_name,
                "protein_g": protein,
                "calories": calories,
                "fat_g": fat,
                "carbs_g": carbs,
                "confidence": confidence,
                "is_estimated": is_estimated,
                "price": item.get("price", 199),
                "delivery_time_min": item.get("delivery_time_min", 30),
                "distance_km": item.get("distance_km", 2.5),
                "delivery_time_spoken": item.get("deliveryTimeSpoken") or f"about {item.get('delivery_time_min', 30)} minutes",
                "short_description": item.get("shortDescription") or f"{item_name} from {item.get('restaurant_name', 'Protein Bowl Co')}. Estimated {protein} grams of protein and {calories} calories.",
                "dietary_preference": item.get("dietary_preference", "any"),
                "rating": item.get("rating", 4.3),
                "popularity_score": item.get("popularity_score", 0.85),
                "availabilityStatus": item.get("availabilityStatus", "OPEN")
            })
        return normalized
