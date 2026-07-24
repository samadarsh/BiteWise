import React from "react";
import { NutritionEntry } from "../lib/api";

interface DailyMealLogProps {
  entries: NutritionEntry[];
}

export default function DailyMealLog({ entries }: DailyMealLogProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-subtle font-bold uppercase tracking-wider text-[10px]">📋 Today&apos;s Meal Entries</span>
      {entries.length === 0 ? (
        <p className="text-xs text-subtle text-center py-4 bg-surface-2 border border-border rounded-xl">
          No meals logged today yet. Order meals or use manual entry below!
        </p>
      ) : (
        <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
          {entries.map((entry) => (
            <div key={entry.id} className="flex justify-between items-center p-3 rounded-xl border border-border bg-surface-2 text-xs">
              <div>
                <p className="font-semibold text-text">{entry.meal_name}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-subtle mt-0.5">
                  <span>🏪 {entry.restaurant_name || "Unknown"}</span>
                  <span>•</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full uppercase text-[8px] font-bold ${
                      entry.source === "order" ? "bg-nutri/10 text-nutri" : "bg-warning/10 text-warning"
                    }`}
                  >
                    {entry.source}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-text font-bold">{Math.round(entry.calories)} kcal</p>
                <p className="text-[10px] text-subtle font-mono">{Math.round(entry.protein_g)}g protein</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
