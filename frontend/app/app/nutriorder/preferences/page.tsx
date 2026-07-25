"use client";

import React from "react";
import { useNutriOrder } from "../../../../lib/nutriorder-context";
import OnboardingPanel from "../../../../components/OnboardingPanel";
import PriorityControls from "../../../../components/PriorityControls";

export default function NutriOrderPreferencesPage() {
  const {
    profile,
    proteinTarget,
    calorieTarget,
    dietPreference,
    allergies,
    dislikes,
    favCuisines,
    fitnessGoal,
    authLoading,
    handleOnboardingSave,
    priorityWeights,
    setPriorityWeights,
  } = useNutriOrder();

  return (
    <main className="max-w-xl w-full mx-auto px-4 py-6 flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-lg font-bold text-text">Preferences</h2>
        <p className="text-xs text-subtle mt-1">Update your biometrics anytime — targets recalculate automatically.</p>
      </div>
      <OnboardingPanel
        profile={
          profile || {
            protein_target: proteinTarget,
            calorie_target: calorieTarget,
            diet_preference: dietPreference,
            allergies,
            dislikes,
            favorite_cuisines: favCuisines,
            fitness_goal: fitnessGoal,
            activity_level: "moderate",
            meal_budget_default: 300,
            preferred_meal_times: {},
            spice_tolerance: "medium",
          }
        }
        onSave={handleOnboardingSave}
        loading={authLoading}
      />
      <div className="w-full">
        <PriorityControls weights={priorityWeights} onChange={setPriorityWeights} />
      </div>
    </main>
  );
}
