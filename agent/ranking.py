import re
from typing import Any, Dict, List, Tuple
from agent.observability import log_info

class RankingFactor:
    def __init__(self, name: str, weight: float) -> None:
        self.name = name
        self.weight = weight

    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        """Compute score from 0.0 to 1.0 and a descriptive explanation."""
        raise NotImplementedError()


class ProteinDensityFactor(RankingFactor):
    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        protein = meal.get("protein_g", 0)
        calories = meal.get("calories")
        
        # Estimate calories if not present
        if not calories:
            # Simple heuristic: assume protein is part of a meal averaging 400-700 kcal
            calories = protein * 8 + 200
        
        density = protein / (calories / 100) if calories > 0 else 0
        target_density = profile.get("target_protein", 30) / (profile.get("target_calories", 650) / 100)
        
        # Score relative to a target density
        score_val = min(density / max(target_density, 0.1), 1.5) / 1.5
        
        return score_val, f"Offers high protein density ({protein}g protein, ~{int(calories)} kcal)"


class CalorieFactor(RankingFactor):
    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        protein = meal.get("protein_g", 0)
        calories = meal.get("calories") or (protein * 8 + 200)
        
        target_calories = profile.get("target_calories", 650)
        goal = profile.get("fitness_goal", "maintenance")
        
        diff = abs(calories - target_calories)
        
        # In fat loss, penalize high calories more severely
        if goal == "fat_loss" and calories > target_calories:
            score_val = max(0.0, 1.0 - (diff / (target_calories * 0.5)))
        # In muscle gain, we actually allow/prefer higher calories up to a surplus
        elif goal == "muscle_gain" and calories > target_calories:
            surplus = calories - target_calories
            if surplus <= 200:
                score_val = 1.0
            else:
                score_val = max(0.0, 1.0 - ((surplus - 200) / (target_calories * 0.5)))
        else:
            score_val = max(0.0, 1.0 - (diff / (target_calories * 0.5)))
            
        return score_val, f"Aligns well with calorie target (~{int(calories)} kcal vs target {target_calories} kcal)"


class FitnessGoalFactor(RankingFactor):
    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        goal = profile.get("fitness_goal", "muscle_gain")
        protein = meal.get("protein_g", 0)
        target_protein = profile.get("target_protein", 30)
        
        if goal == "muscle_gain":
            # Highly reward exceeding protein target
            score_val = min(protein / max(target_protein, 1), 2.0) / 2.0
            explanation = f"Provides {protein}g protein to support muscle recovery"
        elif goal == "fat_loss":
            # Reward meeting protein but penalize calories (handled combined here)
            score_val = min(protein / max(target_protein, 1), 1.2) / 1.2
            explanation = f"High protein ({protein}g) and low fat profile suitable for fat loss"
        else: # maintenance/general
            score_val = min(protein / max(target_protein, 1), 1.0)
            explanation = f"Balanced macronutrients matching general health targets"
            
        return score_val, explanation


class DietaryPreferenceFactor(RankingFactor):
    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        user_preference = profile.get("dietary_preference", "any").lower()
        meal_preference = meal.get("dietary_preference", "any").lower()
        
        # Hard matching logic
        if user_preference == "any":
            return 1.0, "Matches dietary preference"
        if user_preference == "veg" and meal_preference == "non-veg":
            return 0.0, "Violates Vegetarian preference"
        if user_preference == "non-veg" and meal_preference == "veg":
            # A non-veg user can eat veg, but might prefer non-veg.
            return 0.8, "Vegetarian meal (suitable for non-vegetarian)"
        if user_preference == meal_preference:
            return 1.0, f"Perfect match for {user_preference.capitalize()} preference"
            
        return 1.0, "Matches preference"


class CuisinePreferenceFactor(RankingFactor):
    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        fav_cuisines = profile.get("favorite_cuisines", [])
        if not fav_cuisines:
            return 0.5, "Default cuisine score"
            
        # Check if meal name or restaurant contains keywords
        meal_name = meal.get("item_name", "").lower()
        restaurant_name = meal.get("restaurant_name", "").lower()
        
        for cuisine in fav_cuisines:
            cuisine_lower = cuisine.lower()
            if cuisine_lower in meal_name or cuisine_lower in restaurant_name:
                return 1.0, f"Matches your favorite cuisine: {cuisine.capitalize()}"
                
        return 0.4, "General cuisine option"


class BudgetFactor(RankingFactor):
    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        price = meal.get("price", 0)
        budget_max = profile.get("typical_budget", 300)
        
        if price > budget_max:
            return 0.0, "Over budget"
            
        # Give higher score to meals that save money without compromising protein
        savings_ratio = (budget_max - price) / max(budget_max, 1)
        score_val = 0.6 + (savings_ratio * 0.4) # base 0.6 if it fits, up to 1.0 if it's very cheap
        
        return score_val, f"Fits your budget at Rs {price} (max Rs {budget_max})"


class DeliveryTimeFactor(RankingFactor):
    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        eta = meal.get("delivery_time_min", 30)
        max_eta = profile.get("max_delivery_time_min", 45)
        
        if eta > max_eta:
            return 0.0, "Exceeds delivery time limit"
            
        score_val = 1.0 - (eta / max(max_eta, 1)) * 0.5  # faster is better, up to 1.0
        return score_val, f"Fast delivery in {eta} mins (under your {max_eta} min limit)"


class RestaurantRatingFactor(RankingFactor):
    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        rating = meal.get("rating", 4.0) # default to 4.0 if missing
        score_val = rating / 5.0
        return score_val, f"Highly rated restaurant ({rating}★)"


class FoodPopularityFactor(RankingFactor):
    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        popularity = meal.get("popularity_score", 0.7) # default to 0.7
        return popularity, "Popular item choice"


class HistoricalPreferenceFactor(RankingFactor):
    def score(self, meal: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, str]:
        # Checks if user has ordered this item or from this restaurant before
        history_summary = profile.get("history_summary", {})
        fav_restaurants = history_summary.get("favorite_restaurants", [])
        fav_items = history_summary.get("favorite_items", [])
        
        restaurant_id = meal.get("restaurant_id")
        item_id = meal.get("item_id")
        
        score_val = 0.5 # default
        reasons = []
        
        if item_id in fav_items:
            score_val = 1.0
            reasons.append("Frequently ordered item")
        elif restaurant_id in fav_restaurants:
            score_val = 0.8
            reasons.append("From your favorite restaurant")
            
        if reasons:
            return score_val, ", ".join(reasons)
        return score_val, "New option to try"


class RankingEngine:
    def __init__(self) -> None:
        # Register default weights for factors (must sum to something, we normalize anyways)
        self.factors: List[RankingFactor] = [
            ProteinDensityFactor("Protein Density", 0.20),
            CalorieFactor("Calories", 0.15),
            FitnessGoalFactor("Fitness Goal Align", 0.20),
            DietaryPreferenceFactor("Dietary Compatibility", 0.15),
            CuisinePreferenceFactor("Cuisine Preference", 0.05),
            BudgetFactor("Budget Constraints", 0.10),
            DeliveryTimeFactor("Delivery ETA", 0.05),
            RestaurantRatingFactor("Restaurant Rating", 0.05),
            FoodPopularityFactor("Popularity", 0.02),
            HistoricalPreferenceFactor("Ordering History", 0.03)
        ]

    def rank_meals(self, meals: List[Dict[str, Any]], profile: Dict[str, Any]) -> List[Dict[str, Any]]:
        ranked_meals = []
        
        for meal in meals:
            total_score = 0.0
            total_weight = 0.0
            explanation_bullets = []
            
            # Apply dietary filter strictly first (veg vs non-veg)
            diet_factor = next((f for f in self.factors if isinstance(f, DietaryPreferenceFactor)), None)
            if diet_factor:
                diet_score, _ = diet_factor.score(meal, profile)
                if diet_score == 0.0:
                    continue # Strict skip if it violates dietary rules
            
            # Check allergy exclusions
            allergies = profile.get("allergies", [])
            dislikes = profile.get("dislikes", [])
            meal_name = meal.get("item_name", "").lower()
            
            has_allergen = False
            for allergen in allergies:
                if allergen and allergen in meal_name:
                    has_allergen = True
                    break
            if has_allergen:
                continue # Hard skip on allergen matches
                
            has_dislike = False
            for dislike in dislikes:
                if dislike and dislike in meal_name:
                    has_dislike = True
                    break
            if has_dislike:
                continue # Hard skip on disliked ingredients
            
            for factor in self.factors:
                score_val, explanation = factor.score(meal, profile)
                total_score += score_val * factor.weight
                total_weight += factor.weight
                
                # Capture highly scoring explanations (score >= 0.7) or important ones like budget/eta
                if score_val >= 0.7 and len(explanation_bullets) < 5:
                    # Avoid duplicate explanation styles
                    if explanation not in explanation_bullets:
                        explanation_bullets.append(explanation)
            
            final_score = (total_score / total_weight) * 100 if total_weight > 0 else 0.0
            
            meal_with_score = dict(meal)
            meal_with_score["score"] = final_score
            meal_with_score["explanations"] = explanation_bullets
            ranked_meals.append(meal_with_score)
            
        ranked_meals.sort(key=lambda m: m["score"], reverse=True)
        log_info(f"Ranked {len(ranked_meals)} candidate meals. Top match: {ranked_meals[0]['item_name'] if ranked_meals else 'None'}")
        return ranked_meals
