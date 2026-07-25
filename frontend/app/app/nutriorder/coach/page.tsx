"use client";

import React from "react";
import { useNutriOrder } from "../../../../lib/nutriorder-context";
import { useDashboard } from "../../../../lib/dashboard-context";
import CoachDashboard from "../../../../components/CoachDashboard";
import { RecommendationMeal } from "../../../../lib/api";

export default function NutriOrderCoachPage() {
  const { coachDashboardRef, activeSessionId, handleMealSelect } = useNutriOrder();
  const { showAlert } = useDashboard();

  const handleSelectFromCoach = async (meal: RecommendationMeal) => {
    await handleMealSelect(meal);
    showAlert(`${meal.name} added — open the Order page to review your cart and checkout.`, "info");
  };

  return (
    <main className="max-w-4xl w-full mx-auto flex flex-col gap-8">
      <CoachDashboard ref={coachDashboardRef} activeSessionId={activeSessionId} onSelectMeal={handleSelectFromCoach} />
    </main>
  );
}
