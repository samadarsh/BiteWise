import React from "react";
import { CoachStatusResponse } from "../lib/api";

interface NutritionProgressProps {
  status: CoachStatusResponse;
}

export default function NutritionProgress({ status }: NutritionProgressProps) {
  const caloriePercent = Math.min(100, Math.round((status.consumed_calories / (status.target_calories || 1)) * 100));
  const proteinPercent = Math.min(100, Math.round((status.consumed_protein / (status.target_protein || 1)) * 100));

  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-4">
      {/* Calories Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-end text-xs">
          <span className="text-muted font-bold uppercase tracking-wider text-[10px]">🔥 Daily Calories</span>
          <span className="font-mono text-text">
            {Math.round(status.consumed_calories)} / {Math.round(status.target_calories)} kcal
          </span>
        </div>
        <div className="w-full bg-surface-3 rounded-full h-2.5 overflow-hidden border border-border">
          <div style={{ width: `${caloriePercent}%` }} className="bg-nutri h-full rounded-full transition-all duration-500" />
        </div>
        <div className="flex justify-between text-[10px] text-subtle">
          <span>{caloriePercent}% Consumed</span>
          <span className="text-nutri font-medium">{Math.round(status.remaining_calories)} kcal remaining</span>
        </div>
      </div>

      {/* Protein Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-end text-xs">
          <span className="text-muted font-bold uppercase tracking-wider text-[10px]">💪 Daily Protein</span>
          <span className="font-mono text-text">
            {Math.round(status.consumed_protein)}g / {Math.round(status.target_protein)}g
          </span>
        </div>
        <div className="w-full bg-surface-3 rounded-full h-2.5 overflow-hidden border border-border">
          <div style={{ width: `${proteinPercent}%` }} className="bg-info h-full rounded-full transition-all duration-500" />
        </div>
        <div className="flex justify-between text-[10px] text-subtle">
          <span>{proteinPercent}% Consumed</span>
          <span className="text-info font-medium">{Math.round(status.remaining_protein)}g remaining</span>
        </div>
      </div>
    </div>
  );
}
