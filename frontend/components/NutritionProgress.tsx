import React from "react";
import { CoachStatusResponse } from "../lib/api";

interface NutritionProgressProps {
  status: CoachStatusResponse;
  currentStreak?: number;
}

export default function NutritionProgress({ status, currentStreak = 0 }: NutritionProgressProps) {
  const caloriePercent = Math.min(100, Math.round((status.consumed_calories / (status.target_calories || 1)) * 100));
  const proteinPercent = Math.min(100, Math.round((status.consumed_protein / (status.target_protein || 1)) * 100));

  return (
    <div className="bg-gradient-to-br from-surface-2 to-surface border border-border rounded-2xl p-5 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted font-semibold">Today&apos;s progress</p>
          <h2 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight mt-0.5">
            {Math.round(status.consumed_calories)} of {Math.round(status.target_calories)} kcal
          </h2>
          <p className="text-xs text-nutri font-semibold mt-0.5">{Math.round(status.remaining_calories)} kcal to go</p>
        </div>
        {currentStreak > 0 && (
          <span className="shrink-0 flex items-center gap-1.5 bg-warning/10 border border-warning/20 text-warning font-bold text-xs px-3 py-1.5 rounded-full">
            🔥 {currentStreak}-day streak
          </span>
        )}
      </div>

      {/* Calories Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-end text-xs">
          <span className="text-muted font-bold uppercase tracking-wider text-[10px]">🔥 Calories</span>
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
          <span className="text-muted font-bold uppercase tracking-wider text-[10px]">💪 Protein</span>
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
