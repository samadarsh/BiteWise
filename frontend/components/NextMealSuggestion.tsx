import React, { useState } from "react";
import { api, RecommendationMeal, isSwiggyReauthError, SWIGGY_REAUTH_MESSAGE } from "../lib/api";
import { useAuth } from "../lib/auth-context";

interface NextMealSuggestionProps {
  onSelectMeal: (meal: RecommendationMeal) => void;
  activeSessionId: string;
}

export default function NextMealSuggestion({ onSelectMeal }: NextMealSuggestionProps) {
  const { refreshAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [targetMet, setTargetMet] = useState(false);
  const [suggestions, setSuggestions] = useState<RecommendationMeal[]>([]);

  const handleFetchNextMeal = async () => {
    setLoading(true);
    setMessage("");
    setSuggestions([]);
    try {
      const res = await api.getCoachNextMeal();
      if (!res.success) {
        if (res.status === "action_required") {
          setMessage(res.message);
        } else {
          setMessage("Failed to load suggestions.");
        }
        return;
      }

      setMessage(res.message);
      setTargetMet(res.target_met || false);

      const rawCandidates = res.results?.recommendations || [];
      const mapped = rawCandidates.map((c) => ({
        id: c.item_id,
        name: c.name || c.item_name || "Recommended meal",
        restaurant: c.restaurant_name || "Unknown Restaurant",
        price: c.price,
        eta: c.delivery_time_min != null ? `${c.delivery_time_min} mins` : (c.delivery_time_spoken as string | undefined),
        protein: `${c.protein_g || 0}g`,
        calories: c.calories ? `${c.calories} kcal` : "N/A",
        score: c.match_score || 80,
        reasons: c.explanations || ["Fits nutritional criteria."],
        why_this_meal: c.why_this_meal || [],
        tradeoffs: c.tradeoffs || [],
        confidence: c.confidence || 1.0,
        is_estimated: c.is_estimated !== false,
        restaurant_id: c.restaurant_id,
        item_id: c.item_id,
        distance_km: (c.distance_km ?? undefined) as number | undefined,
      }));
      setSuggestions(mapped);
    } catch (err) {
      if (isSwiggyReauthError(err)) {
        refreshAuth();
        setMessage(SWIGGY_REAUTH_MESSAGE);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setMessage(`Coach inquiry failed: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-info/5 border border-info/20 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h3 className="text-sm font-bold text-text">What do you need next?</h3>
          <p className="text-[11px] text-subtle mt-0.5">Meals picked to close today&apos;s gap to your goal — not a generic search.</p>
        </div>
        {loading && <span className="shrink-0 text-[10px] text-info font-mono animate-pulse">Analyzing…</span>}
      </div>

      <button
        onClick={handleFetchNextMeal}
        disabled={loading}
        className="w-full bg-info hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-md"
      >
        {loading ? "Generating suggestions…" : "Suggest My Next Meal"}
      </button>

      {message && (
        <div
          className={`p-2.5 rounded-lg text-[11px] leading-relaxed border ${
            targetMet
              ? "bg-success/10 border-success/20 text-success"
              : message.includes("required") || message.includes("failed")
              ? "bg-danger/10 border-danger/20 text-danger"
              : "bg-surface border-border text-muted"
          }`}
        >
          {message}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1 mt-1">
          {suggestions.map((meal) => (
            <div
              key={meal.id}
              onClick={() => onSelectMeal(meal)}
              className="group flex flex-col gap-2 p-3 rounded-xl border border-border bg-surface hover:border-border-strong cursor-pointer transition text-left"
            >
              <div className="flex justify-between items-start gap-1">
                <div>
                  <h5 className="font-semibold text-text text-xs leading-snug group-hover:text-info transition">{meal.name}</h5>
                  <p className="text-[10px] text-subtle mt-0.5">🏪 {meal.restaurant}</p>
                </div>
                <span className="bg-info/10 text-info text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono">{Math.round(meal.score)}% fit</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-muted border-t border-border pt-1.5">
                <span className="font-mono text-[9px] text-subtle">
                  {meal.calories} | {meal.protein}
                </span>
                <span className="font-bold text-text">Rs {meal.price}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
