"use client";

import React from "react";
import { useSmartPantry } from "../../../../lib/smartpantry-context";
import CookTodayPanel from "../../../../components/household/CookTodayPanel";

export default function SmartPantryCookPage() {
  const { handleMatchRecipe, loadData } = useSmartPantry();

  return (
    <div className="max-w-3xl w-full mx-auto">
      <CookTodayPanel onPlanRecipe={handleMatchRecipe} onCookSuccess={loadData} />
    </div>
  );
}
