import re
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
                    "error_type": "no_candidates",
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
                    "cartItems": [{"menu_item_id": best_meal["item_id"], "quantity": 1}],
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
                "error_type": "upstream_error",
                "message": f"Swiggy API Error: {str(e)}"
            }
        except Exception as e:
            log_error(f"Unexpected error in pipeline: {str(e)}", error_category="internal_error")
            metrics_tracker.record_recommendation(success=False)
            return {
                "success": False,
                "error_type": "internal_error",
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
        # "non veg" / "nonveg" / "non-veg" must never be read as "veg" —
        # a plain substring check for "veg" flipped those to vegetarian.
        if re.search(r"\bnon[\s-]?veg", raw_lower):
            intent["dietary_preference"] = "non-veg"
        elif re.search(r"\b(veg|vegetarian|vegan)\b", raw_lower):
            intent["dietary_preference"] = "veg"
            
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
                candidates = self._enrich_and_filter_by_restaurant_status(candidates, address_id)
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

                        # Real field names from a live search_restaurants
                        # response: distanceKm, deliveryTimeMinutes, avgRating
                        # — confirmed against the actual API. The old code
                        # read delivery_time_min/distance_km/rating (none of
                        # which exist under those names), so it always missed
                        # this real data and silently substituted fake
                        # constants (30 min, 2.5 km) instead.
                        real_eta = rest.get("deliveryTimeMinutes")
                        real_distance = rest.get("distanceKm")
                        real_rating = rest.get("avgRating")
                        # get_restaurant_menu items carry a real isVeg boolean
                        # — use it instead of guessing "any".
                        item_is_veg = item.get("isVeg")
                        veg_pref = "veg" if item_is_veg is True else "non-veg" if item_is_veg is False else "any"

                        candidates.append({
                            "restaurant_id": rest["id"],
                            "restaurant_name": rest["name"],
                            "item_id": item["id"],
                            "item_name": item_name,
                            "description": desc,
                            "protein_g": protein,
                            "calories": calories,
                            "fat_g": fat,
                            "carbs_g": carbs,
                            "confidence": confidence,
                            "is_estimated": is_estimated,
                            "price": item["price"],
                            "delivery_time_min": real_eta,
                            "distance_km": real_distance,
                            "delivery_time_spoken": rest.get("deliveryTimeRange") or (f"about {real_eta} minutes" if real_eta is not None else None),
                            "short_description": item.get("shortDescription") or f"{item_name} from {rest['name']}. Estimated {protein} grams of protein and {calories} calories.",
                            "dietary_preference": veg_pref,
                            "rating": self._safe_float(real_rating, None),
                            "availabilityStatus": rest.get("availabilityStatus")
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
                    candidates = self._enrich_and_filter_by_restaurant_status(candidates, address_id)
                    fallback_warnings.append(
                        f"Budget constraint relaxed to Rs {profile['typical_budget']} "
                        f"and delivery limit extended to 60 minutes."
                    )
            except Exception as e:
                log_error(f"Fallback 2 search failed: {str(e)}", error_category="upstream_error")

        return candidates, fallback_warnings

    def _enrich_and_filter_by_restaurant_status(self, candidates: List[Dict[str, Any]], address_id: str) -> List[Dict[str, Any]]:
        """
        search_menu carries no open/closed, rating, or delivery-time signal
        at all — without this, a restaurant that's actually closed (e.g. late
        at night) could still be recommended, contradicting Swiggy's own
        guidance to only recommend/add items from OPEN restaurants. Mock mode
        already sets honest per-item data directly, so this only runs for
        real Swiggy data, and only against each unique restaurant found in
        the results (cached 30 min per restaurant, same as get_restaurant_menu).
        """
        from config.settings import get_settings
        if get_settings().use_mock_mcp:
            return candidates

        restaurant_ids = {c["restaurant_id"] for c in candidates if c.get("restaurant_id") and c["restaurant_id"] != "unknown_restaurant"}
        meta_by_restaurant: Dict[str, Dict[str, Any]] = {}
        for rid in restaurant_ids:
            try:
                result = self._execute_mcp_call("get_restaurant_menu_with_metadata", {"addressId": address_id, "restaurantId": rid})
                restaurant = result.get("restaurant") if isinstance(result, dict) else None
                if isinstance(restaurant, dict):
                    meta_by_restaurant[rid] = restaurant
            except Exception as e:
                # Fail open on a lookup error — don't hide an item just
                # because a status check glitched, only when we positively
                # confirm it's closed.
                log_warn(f"Could not verify open/closed status for restaurant {rid}: {str(e)}")

        enriched: List[Dict[str, Any]] = []
        for c in candidates:
            meta = meta_by_restaurant.get(c.get("restaurant_id", ""))
            # Confirmed live: Swiggy never sends isOpen: false for a closed
            # restaurant — it omits the field entirely (open restaurants get
            # isOpen: true explicitly). So "not True" (missing or False) is
            # the real closed signal, not a literal False check, which never
            # actually matches anything Swiggy sends.
            if meta is not None and meta.get("isOpen") is not True:
                continue
            if meta is not None:
                if c.get("rating") is None:
                    c["rating"] = self._safe_float(meta.get("avgRating"), None)
                if c.get("delivery_time_min") is None:
                    c["delivery_time_min"] = meta.get("deliveryTime")
                    if c["delivery_time_min"] is not None and not c.get("delivery_time_spoken"):
                        c["delivery_time_spoken"] = f"about {c['delivery_time_min']} minutes"
                if c.get("availabilityStatus") is None:
                    c["availabilityStatus"] = "OPEN" if meta.get("isOpen") else None
            enriched.append(c)
        return enriched

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
        if tool_name in ("get_restaurant_menu", "get_restaurant_menu_with_metadata"):
            ttl = 1800.0
        elif tool_name == "get_addresses":
            ttl = 3600.0
            
        mcp_cache.set(tool_name, arguments, val, ttl)
        return val

    @staticmethod
    def _safe_float(value: Any, default: Optional[float]) -> Optional[float]:
        """Real Swiggy responses mix numeric types freely (e.g. search_menu's
        "rating" comes back as the string "4.8", not a float) — ranking.py's
        factors do arithmetic on these fields directly, so a raw string here
        crashes the whole pipeline with a silently-swallowed TypeError."""
        if value is None:
            return default
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

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
            
            restaurant_name = item.get("restaurant_name") or "Restaurant"

            normalized.append({
                # "rest_1" / "Protein Bowl Co" were made-up placeholder
                # values baked into the real-mode path — real search_menu
                # always provides these, so this only matters as a last
                # resort, and even then it should read as "unknown", not a
                # specific fake brand name.
                "restaurant_id": item.get("restaurant_id") or "unknown_restaurant",
                "restaurant_name": restaurant_name,
                # menu_item_id is the real search_menu field name (confirmed
                # against a live response); id/item_id are the mock client's
                # naming, kept as fallbacks so mock mode is unaffected.
                "item_id": item.get("menu_item_id") or item.get("id") or item.get("item_id"),
                "item_name": item_name,
                "description": desc,
                "protein_g": protein,
                "calories": calories,
                "fat_g": fat,
                "carbs_g": carbs,
                "confidence": confidence,
                "is_estimated": is_estimated,
                "price": item.get("price", 199),
                # Confirmed live: search_menu items carry no delivery-time,
                # distance, or open/closed signal at all (that data only
                # exists on search_restaurants results) — this used to
                # fabricate a specific-sounding "30 min, 2.5 km" for every
                # real item instead of admitting the data isn't there.
                # None here means "unknown", not "unavailable" or "far away".
                "delivery_time_min": item.get("delivery_time_min"),
                "distance_km": item.get("distance_km"),
                "delivery_time_spoken": item.get("deliveryTimeSpoken") or (f"about {item['delivery_time_min']} minutes" if item.get("delivery_time_min") is not None else None),
                "short_description": item.get("shortDescription") or f"{item_name} from {restaurant_name}. Estimated {protein} grams of protein and {calories} calories.",
                "dietary_preference": item.get("dietary_preference", "any"),
                "rating": self._safe_float(item.get("rating"), None),
                "popularity_score": self._safe_float(item.get("popularity_score"), None),
                # search_menu never reports this — defaulting to a fake
                # "OPEN" would silently vouch for restaurants we have no
                # actual signal about. None passes through _validate_constraints
                # unfiltered (the honest behavior when status is unknown),
                # matching how a real value would filter closed restaurants.
                "availabilityStatus": item.get("availabilityStatus")
            })
        return normalized
