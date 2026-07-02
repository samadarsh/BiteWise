from typing import Dict, Any

class NutritionTargetEngine:
    @staticmethod
    def calculate_targets(profile: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculates daily and per-meal calorie, protein, carb, and fat targets
        using the Mifflin-St Jeor formula and fitness goal multipliers.
        """
        age = profile.get("age")
        gender = profile.get("gender")
        height = profile.get("height_cm")
        weight = profile.get("weight_kg")
        activity_level = profile.get("activity_level", "moderate")
        fitness_goal = profile.get("fitness_goal", "maintenance")
        
        # Fallback if biometrics are incomplete
        if not age or not gender or not height or not weight:
            meal_cal = profile.get("calorie_target") or 650
            meal_prot = profile.get("protein_target") or 35
            return {
                "daily_calories": meal_cal * 3,
                "meal_calories": meal_cal,
                "daily_protein": meal_prot * 3,
                "meal_protein": meal_prot,
                "daily_fat": 65,
                "meal_fat": 22,
                "daily_carbs": 250,
                "meal_carbs": 83,
                "goal_reason": "Default nutritional profile based on manual macro targets."
            }

        # Mifflin-St Jeor BMR
        if str(gender).lower() == "male":
            bmr = 10.0 * weight + 6.25 * height - 5.0 * age + 5.0
        else:
            bmr = 10.0 * weight + 6.25 * height - 5.0 * age - 161.0
            
        # Activity Multipliers
        multipliers = {
            "sedentary": 1.2,
            "light": 1.375,
            "moderate": 1.55,
            "active": 1.725,
            "very_active": 1.9
        }
        multiplier = multipliers.get(str(activity_level).lower(), 1.55)
        tdee = bmr * multiplier
        
        # Goal adjustments
        if fitness_goal == "fat_loss":
            daily_calories = tdee - 500.0
            goal_reason = f"Mild calorie deficit ({int(daily_calories)} kcal) to support fat loss."
            protein_per_kg = 2.0
        elif fitness_goal == "muscle_gain":
            daily_calories = tdee + 300.0
            goal_reason = f"Mild calorie surplus ({int(daily_calories)} kcal) to support muscle hypertrophy."
            protein_per_kg = 2.2
        else:
            daily_calories = tdee
            goal_reason = f"Iso-caloric maintenance ({int(daily_calories)} kcal) to support current bodyweight."
            protein_per_kg = 1.6
            
        daily_calories = max(daily_calories, 1200.0)
        
        # Daily protein limit
        daily_protein = weight * protein_per_kg
        daily_protein = max(60.0, min(daily_protein, 200.0))
        
        # Daily fat: 25% of calories
        daily_fat = (daily_calories * 0.25) / 9.0
        daily_fat = max(30.0, min(daily_fat, 100.0))
        
        # Daily carbs: Remainder
        protein_kcal = daily_protein * 4.0
        fat_kcal = daily_fat * 9.0
        carb_kcal = daily_calories - (protein_kcal + fat_kcal)
        daily_carbs = max(50.0, carb_kcal / 4.0)
        
        return {
            "daily_calories": int(daily_calories),
            "meal_calories": int(daily_calories / 3),
            "daily_protein": int(daily_protein),
            "meal_protein": int(daily_protein / 3),
            "daily_fat": int(daily_fat),
            "meal_fat": int(daily_fat / 3),
            "daily_carbs": int(daily_carbs),
            "meal_carbs": int(daily_carbs / 3),
            "goal_reason": goal_reason
        }
