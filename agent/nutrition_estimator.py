import re
from typing import Dict, Any, List

class NutritionEstimator:
    @staticmethod
    def estimate_nutrition(item_name: str, item_description: str = "") -> Dict[str, Any]:
        """
        Estimates macronutrients (calories, protein_g, carbs_g, fat_g) and returns
        a confidence score along with detected ingredient signals.
        """
        text = f"{item_name} {item_description}".lower()
        signals: List[str] = []
        
        # 1. Base Protein Ingredients (protein, calories, fat, carbs)
        protein_bases = {
            r"\b(chicken breast|grilled chicken)\b": (35, 300, 5, 2),
            r"\b(chicken|murgh|chicken tikka|kebab|tandoori)\b": (26, 400, 15, 4),
            r"\b(egg|anda|omlette|scrambled)\b": (14, 180, 12, 1),
            r"\b(paneer|cottage cheese)\b": (18, 380, 26, 6),
            r"\b(tofu|soya|soybean)\b": (20, 250, 10, 8),
            r"\b(fish|salmon|tuna|prawn|shrimp|seafood|machli)\b": (24, 260, 6, 1),
            r"\b(dal|lentil|chole|rajma|chana|sprouts)\b": (10, 280, 4, 45),
        }
        
        base_protein = 0
        base_calories = 0
        base_fat = 0
        base_carbs = 0
        
        for pattern, values in protein_bases.items():
            if re.search(pattern, text):
                base_protein = max(base_protein, values[0])
                base_calories = max(base_calories, values[1])
                base_fat = max(base_fat, values[2])
                base_carbs = max(base_carbs, values[3])
                signals.append(re.search(pattern, text).group(0))

        # 2. Base Meal Types
        meal_bases = {
            r"\b(salad|bowl)\b": (5, 120, 4, 10),
            r"\b(rice|pulao|jeera)\b": (4, 300, 1, 65),
            r"\b(biryani)\b": (12, 650, 20, 85),
            r"\b(pizza)\b": (14, 800, 28, 90),
            r"\b(burger)\b": (16, 550, 22, 50),
            r"\b(wrap|roll|roti|chapati|naan|bread)\b": (6, 240, 6, 38),
            r"\b(soup|shorba)\b": (3, 100, 2, 12),
        }

        meal_protein = 0
        meal_calories = 0
        meal_fat = 0
        meal_carbs = 0
        
        for pattern, values in meal_bases.items():
            if re.search(pattern, text):
                meal_protein = max(meal_protein, values[0])
                meal_calories = max(meal_calories, values[1])
                meal_fat = max(meal_fat, values[2])
                meal_carbs = max(meal_carbs, values[3])
                signals.append(re.search(pattern, text).group(0))

        # Combine bases
        est_protein = max(base_protein, meal_protein)
        est_calories = base_calories + meal_calories
        est_fat = max(base_fat, meal_fat)
        est_carbs = max(base_carbs, meal_carbs)
        
        # If both are present, blend them logically (e.g. chicken salad shouldn't be salad calories + chicken calories fully)
        if base_protein > 0 and meal_protein > 0:
            if "salad" in signals or "soup" in signals:
                est_calories = int(base_calories * 1.1)
                est_carbs = max(base_carbs, meal_carbs)
                est_fat = max(base_fat, meal_fat)
            elif "rice" in signals or "biryani" in signals:
                est_calories = base_calories + int(meal_calories * 0.8)
                est_carbs = base_carbs + meal_carbs
                est_fat = base_fat + meal_fat
            else:
                est_calories = max(base_calories, meal_calories) + 150

        # 3. Portion Size Multipliers
        portion_multiplier = 1.0
        if re.search(r"\b(double|jumbo|large|platter|combo|king|supreme)\b", text):
            portion_multiplier = 1.4
            signals.append("large portion")
        elif re.search(r"\b(mini|half|single|light|small|kids)\b", text):
            portion_multiplier = 0.65
            signals.append("small portion")
            
        est_protein = int(est_protein * portion_multiplier)
        est_calories = int(est_calories * portion_multiplier)
        est_fat = int(est_fat * portion_multiplier)
        est_carbs = int(est_carbs * portion_multiplier)

        # 4. Cuisine Additives
        if re.search(r"\b(fried|crispy|deep fried|tempura|fritter)\b", text):
            est_calories += 180
            est_fat += 15
            signals.append("fried prep")
        if re.search(r"\b(butter|butter masala|makhani|ghee|cheese|cheesy|creamy)\b", text):
            est_calories += 160
            est_fat += 14
            signals.append("heavy fat source")
        if re.search(r"\b(diet|keto|healthy|roasted|steamed|boiled|grilled|clear)\b", text):
            est_calories = max(120, est_calories - 60)
            est_fat = max(2, est_fat - 4)
            signals.append("healthy prep")

        # 5. Default Fallbacks if no match
        if est_calories == 0:
            est_calories = 350
            est_protein = 8
            est_fat = 10
            est_carbs = 45
            confidence = 0.40
            signals.append("vague heuristic fallback")
        else:
            # Determine confidence
            match_count = len(signals)
            if match_count >= 3:
                confidence = 0.85
            elif match_count == 2:
                confidence = 0.75
            else:
                confidence = 0.60
                
        return {
            "estimated_calories": est_calories,
            "estimated_protein_g": est_protein,
            "estimated_fat_g": est_fat,
            "estimated_carbs_g": est_carbs,
            "confidence": round(confidence, 2),
            "signals": signals
        }
