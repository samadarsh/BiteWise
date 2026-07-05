import React, { useState, useEffect, useCallback } from "react";
import { api, CookTodayResponse, RecipeSuggestion, SkippedRecipe } from "../../lib/api";

interface CookTodayPanelProps {
  onPlanRecipe: (recipe: {
    recipe_name: string;
    ingredients: { name: string; qty: number; unit: string }[];
    planned_for_date: string;
  }) => Promise<unknown>;
}

export default function CookTodayPanel({ onPlanRecipe }: CookTodayPanelProps) {
  const [data, setData] = useState<CookTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [planningRecipe, setPlanningRecipe] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await api.getCookTodaySuggestions();
      setData(res);
    } catch {
      // Silently degrade
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSuggestions();
  }, [loadSuggestions]);

  const handlePlanRecipe = async (recipe: RecipeSuggestion) => {
    setPlanningRecipe(recipe.name);
    try {
      const today = new Date().toISOString().split("T")[0];
      await onPlanRecipe({
        recipe_name: recipe.name,
        ingredients: recipe.missing_items.map((mi) => ({
          name: mi.name,
          qty: mi.deficit,
          unit: mi.unit,
        })),
        planned_for_date: today,
      });
      await loadSuggestions();
    } catch {
      alert("Failed to plan recipe");
    } finally {
      setPlanningRecipe(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          🍳 What Can I Cook Today?
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const coverageBarColor = (pct: number) => {
    if (pct >= 100) return "bg-emerald-500";
    if (pct >= 60) return "bg-emerald-500/70";
    if (pct >= 30) return "bg-amber-500/70";
    return "bg-rose-500/50";
  };

  const dietBadge = (diet: string) =>
    diet === "veg" ? (
      <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        VEG
      </span>
    ) : (
      <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
        NON-VEG
      </span>
    );

  return (
    <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          🍳 What Can I Cook Today?
        </h3>
        <div className="flex items-center gap-2">
          {data.cookable_now > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {data.cookable_now} ready now
            </span>
          )}
          <span className="text-[10px] font-semibold text-slate-500">
            {data.total_recipes} recipes
          </span>
        </div>
      </div>

      {/* Recipe Cards */}
      <div className="grid grid-cols-1 gap-3">
        {data.suggestions.map((recipe: RecipeSuggestion) => {
          const dimmed = recipe.coverage_pct < 50;
          return (
            <div
              key={recipe.name}
              className={`p-3 rounded-xl border transition-all ${
                dimmed
                  ? "border-slate-800/50 bg-slate-950/30 opacity-60"
                  : recipe.can_cook_now
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-slate-800 bg-slate-950/50"
              }`}
            >
              {/* Recipe Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{recipe.name}</span>
                  {dietBadge(recipe.diet)}
                  {recipe.can_cook_now && (
                    <span className="text-[9px] font-black text-emerald-400 uppercase">✓ Ready</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-slate-500">
                  {recipe.tag}
                </span>
              </div>

              {/* Coverage Bar */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${coverageBarColor(recipe.coverage_pct)}`}
                    style={{ width: `${Math.min(recipe.coverage_pct, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-300 w-12 text-right">
                  {recipe.coverage_pct}%
                </span>
              </div>

              {/* Missing Items */}
              {recipe.missing_items.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {recipe.missing_items.map((mi) => (
                    <span
                      key={mi.name}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    >
                      {mi.name} ({mi.deficit} {mi.unit})
                    </span>
                  ))}
                </div>
              )}

              {/* Action Button */}
              {!recipe.can_cook_now && recipe.missing_items.length > 0 && (
                <button
                  onClick={() => handlePlanRecipe(recipe)}
                  disabled={planningRecipe === recipe.name}
                  className="text-[10px] font-bold px-3 py-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition disabled:opacity-50"
                >
                  {planningRecipe === recipe.name
                    ? "Adding to list..."
                    : `Add ${recipe.missing_items.length} missing to grocery list`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Skipped Recipes */}
      {data.skipped_recipes.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setShowSkipped(!showSkipped)}
            className="text-[10px] font-semibold text-slate-500 hover:text-slate-400 transition"
          >
            {showSkipped ? "▲ Hide" : "▼ Show"} {data.skipped_recipes.length} skipped recipes
          </button>
          {showSkipped && (
            <div className="mt-2 space-y-1">
              {data.skipped_recipes.map((sr: SkippedRecipe) => (
                <div
                  key={sr.recipe}
                  className="text-[10px] text-slate-500 flex items-center gap-2"
                >
                  <span className="line-through">{sr.recipe}</span>
                  <span className="text-amber-500/70 font-semibold">— {sr.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
