import React, { useState, useEffect, useCallback } from "react";
import { api, CookTodayResponse, RecipeSuggestion, SkippedRecipe } from "../../lib/api";

interface CookTodayPanelProps {
  onPlanRecipe: (recipe: {
    recipe_name: string;
    ingredients: { name: string; qty: number; unit: string }[];
    planned_for_date: string;
  }) => Promise<unknown>;
  onCookSuccess?: () => void | Promise<void>;
}

export default function CookTodayPanel({ onPlanRecipe, onCookSuccess }: CookTodayPanelProps) {
  const [data, setData] = useState<CookTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [planningRecipe, setPlanningRecipe] = useState<string | null>(null);
  const [cookingRecipe, setCookingRecipe] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [cookMessage, setCookMessage] = useState<string | null>(null);

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
    setCookMessage(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      const missingCount = recipe.missing_items.length;
      await onPlanRecipe({
        recipe_name: recipe.name,
        ingredients: recipe.missing_items.map((mi) => ({
          name: mi.name,
          qty: 1.0, // default Pack/Unit for qualitative matching
          unit: "pack",
        })),
        planned_for_date: today,
      });
      setCookMessage(`✅ Added ${missingCount} item${missingCount === 1 ? "" : "s"} to your grocery list for ${recipe.name}.`);
      setTimeout(() => setCookMessage(null), 5000);
      await loadSuggestions();
    } catch {
      alert("Failed to plan recipe");
    } finally {
      setPlanningRecipe(null);
    }
  };

  const handleCookRecipe = async (recipeName: string) => {
    setCookingRecipe(recipeName);
    setCookMessage(null);
    try {
      const res = await api.cookRecipe(recipeName);
      if (res.success) {
        setCookMessage(`🎉 Cooked ${recipeName}! Pantry items updated.`);
        setTimeout(() => setCookMessage(null), 5000);
        
        await loadSuggestions();
        if (onCookSuccess) {
          await onCookSuccess();
        }
      }
    } catch (err) {
      alert("Failed to record cooking: " + err);
    } finally {
      setCookingRecipe(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface backdrop-blur-md border border-border rounded-2xl p-6 shadow-xl">
        <h3 className="text-lg font-bold text-text flex items-center gap-2">
          🍳 What Can I Cook Today?
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-nutri" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const coverageBarColor = (pct: number) => {
    if (pct >= 100) return "bg-nutri";
    if (pct >= 60) return "bg-nutri/70";
    if (pct >= 30) return "bg-warning/70";
    return "bg-danger/50";
  };

  const dietBadge = (diet: string) =>
    diet === "veg" ? (
      <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-nutri/20 text-nutri border border-nutri/30">
        VEG
      </span>
    ) : (
      <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-danger/20 text-danger border border-danger/30">
        NON-VEG
      </span>
    );

  return (
    <div className="bg-surface backdrop-blur-md border border-border rounded-2xl p-6 shadow-xl flex flex-col gap-4 text-left">
      <div className="flex justify-between items-center border-b border-border pb-3">
        <h3 className="text-lg font-bold text-text flex items-center gap-2">
          🍳 What Can I Cook Today?
        </h3>
        <div className="flex items-center gap-2">
          {data.cookable_now > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-nutri/20 text-nutri border border-nutri/30">
              {data.cookable_now} ready now
            </span>
          )}
          <span className="text-[10px] font-semibold text-subtle">
            {data.total_recipes} recipes
          </span>
        </div>
      </div>

      {cookMessage && (
        <div className="p-3 rounded-xl border border-nutri/30 bg-nutri/10 text-nutri text-xs font-semibold">
          {cookMessage}
        </div>
      )}

      {/* Recipe Cards */}
      <div className="grid grid-cols-1 gap-3 max-h-[420px] overflow-y-auto pr-1">
        {data.suggestions.map((recipe: RecipeSuggestion) => {
          const dimmed = recipe.coverage_pct < 50;
          return (
            <div
              key={recipe.name}
              className={`p-3 rounded-xl border transition-all flex flex-col gap-2.5 ${
                dimmed
                  ? "border-border bg-surface-2 opacity-60"
                  : recipe.can_cook_now
                  ? "border-nutri/30 bg-nutri/5"
                  : "border-border bg-surface-2"
              }`}
            >
              {/* Recipe Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-text">{recipe.name}</span>
                  {dietBadge(recipe.diet)}
                  {recipe.can_cook_now && (
                    <span className="text-[9px] font-black text-nutri uppercase">✓ Ready</span>
                  )}
                  {recipe.uses_expiring_items && (
                    <span className="text-[9px] font-black bg-warning/15 text-warning border border-warning/25 rounded px-1.5 uppercase tracking-wide">
                      ⏰ Expiring Ingredients
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-subtle">
                  {recipe.tag}
                </span>
              </div>

              {/* Coverage Bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${coverageBarColor(recipe.coverage_pct)}`}
                    style={{ width: `${Math.min(recipe.coverage_pct, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-muted w-12 text-right">
                  {recipe.coverage_pct}%
                </span>
              </div>

              {/* Missing Items */}
              {recipe.missing_items.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {recipe.missing_items.map((mi) => (
                    <span
                      key={mi.name}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20"
                    >
                      Missing: {mi.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1 border-t border-border/60 mt-1">
                {recipe.coverage_pct > 0 && (
                  <button
                    onClick={() => handleCookRecipe(recipe.name)}
                    disabled={cookingRecipe !== null}
                    className="text-[10px] font-bold px-3 py-1.5 rounded bg-nutri text-nutri-contrast hover:brightness-105 transition disabled:opacity-50"
                  >
                    {cookingRecipe === recipe.name ? "Updating pantry..." : "🍳 I Cooked This"}
                  </button>
                )}
                {!recipe.can_cook_now && recipe.missing_items.length > 0 && (
                  <button
                    onClick={() => handlePlanRecipe(recipe)}
                    disabled={planningRecipe === recipe.name}
                    className="text-[10px] font-bold px-3 py-1.5 rounded bg-info/20 text-info border border-info/30 hover:bg-info/30 transition disabled:opacity-50"
                  >
                    {planningRecipe === recipe.name
                      ? "Adding..."
                      : `Add missing to list`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Skipped Recipes */}
      {data.skipped_recipes.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setShowSkipped(!showSkipped)}
            className="text-[10px] font-semibold text-subtle hover:text-muted transition"
          >
            {showSkipped ? "▲ Hide" : "▼ Show"} {data.skipped_recipes.length} skipped recipes
          </button>
          {showSkipped && (
            <div className="mt-2 space-y-1">
              {data.skipped_recipes.map((sr: SkippedRecipe) => (
                <div
                  key={sr.recipe}
                  className="text-[10px] text-subtle flex items-center gap-2"
                >
                  <span className="line-through">{sr.recipe}</span>
                  <span className="text-warning/70 font-semibold">— {sr.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
