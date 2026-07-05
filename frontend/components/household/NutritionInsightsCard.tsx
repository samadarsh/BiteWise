import React, { useState, useEffect, useCallback } from "react";
import { api, HouseholdInsightsResponse, MemberInsight } from "../../lib/api";

export default function NutritionInsightsCard() {
  const [data, setData] = useState<HouseholdInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadInsights = useCallback(async () => {
    try {
      const res = await api.getHouseholdInsights();
      setData(res);
    } catch {
      // Silently degrade
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInsights();
  }, [loadInsights]);

  if (loading) {
    return (
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          📊 Nutrition Balance
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const maxCalories = Math.max(
    ...data.member_breakdown.map((m) => m.calorie_target || 0),
    1
  );
  const maxProtein = Math.max(
    ...data.member_breakdown.map((m) => m.protein_target || 0),
    1
  );

  const dietIcon = (pref: string) => {
    switch (pref) {
      case "vegetarian": return "🟢";
      case "vegan": return "🌱";
      default: return "🔵";
    }
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          📊 Nutrition Balance
        </h3>
        <span className="text-[10px] font-semibold text-slate-500">
          {data.total_members} members
        </span>
      </div>

      {/* Household Totals */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/10 to-slate-900 border border-orange-500/20">
          <p className="text-[10px] font-semibold uppercase text-orange-400/70">Daily Calories</p>
          <p className="text-xl font-black text-white mt-0.5">
            {data.total_household_calories.toLocaleString()}
            <span className="text-xs font-semibold text-slate-500 ml-1">kcal</span>
          </p>
        </div>
        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-slate-900 border border-blue-500/20">
          <p className="text-[10px] font-semibold uppercase text-blue-400/70">Daily Protein</p>
          <p className="text-xl font-black text-white mt-0.5">
            {data.total_household_protein}
            <span className="text-xs font-semibold text-slate-500 ml-1">g</span>
          </p>
        </div>
      </div>

      {/* Per-Member Breakdown */}
      <div className="space-y-3">
        {data.member_breakdown.map((member: MemberInsight) => (
          <div key={member.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{dietIcon(member.dietary_preference)}</span>
                <span className="text-xs font-bold text-white">{member.name}</span>
                {member.dietary_preference !== "any" && (
                  <span className="text-[9px] font-semibold text-slate-500 capitalize">
                    ({member.dietary_preference})
                  </span>
                )}
              </div>
              {member.has_targets && (
                <span className="text-[10px] font-mono text-slate-500">
                  {member.calorie_target} kcal · {member.protein_target}g
                </span>
              )}
            </div>

            {member.has_targets && (
              <div className="flex gap-2">
                {/* Calorie bar */}
                <div className="flex-1">
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
                      style={{
                        width: `${Math.min((member.calorie_target / maxCalories) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
                {/* Protein bar */}
                <div className="flex-1">
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                      style={{
                        width: `${Math.min((member.protein_target / maxProtein) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Member allergies */}
            {member.allergies.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {member.allergies.map((a: string) => (
                  <span
                    key={a}
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  >
                    ⚠ {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Combined Allergies */}
      {data.combined_allergies.length > 0 && (
        <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/20">
          <p className="text-[10px] font-semibold text-rose-400 mb-1">
            ⚠ Household Allergens (avoid in shared meals)
          </p>
          <div className="flex flex-wrap gap-1">
            {data.combined_allergies.map((a: string) => (
              <span
                key={a}
                className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/25 capitalize"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dietary Conflicts */}
      {data.dietary_conflicts.length > 0 && (
        <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <p className="text-[10px] font-semibold text-amber-400 mb-1">
            🔄 Dietary Notes
          </p>
          {data.dietary_conflicts.map((conflict: string, i: number) => (
            <p key={i} className="text-[10px] text-amber-300/80">
              {conflict}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
