"use client";

import React from "react";
import { useSmartPantry } from "../../../../lib/smartpantry-context";
import HouseholdMembersCard from "../../../../components/household/HouseholdMembersCard";
import NutritionInsightsCard from "../../../../components/household/NutritionInsightsCard";

export default function SmartPantryHouseholdPage() {
  const { household, handleAddMember, handleDeleteMember } = useSmartPantry();

  return (
    <div className="max-w-3xl w-full mx-auto flex flex-col gap-4 sm:gap-6">
      <HouseholdMembersCard members={household?.members || []} onAddMember={handleAddMember} onDeleteMember={handleDeleteMember} />
      <NutritionInsightsCard />
    </div>
  );
}
