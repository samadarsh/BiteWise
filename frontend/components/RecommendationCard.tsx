import React from "react";
import { RecommendationMeal } from "../lib/api";

interface RecommendationCardProps {
  meal: RecommendationMeal;
  onSelect: (meal: RecommendationMeal) => void;
  selected: boolean;
  loading: boolean;
}

export default function RecommendationCard({ meal, onSelect, selected, loading }: RecommendationCardProps) {
  const isEstimated = meal.is_estimated !== false;
  const confidence = meal.confidence || 0.8;

  return (
    <div
      data-testid="recommendation-card"
      onClick={() => !loading && onSelect(meal)}
      className={`border rounded-2xl p-5 transition text-left cursor-pointer flex flex-col gap-3 relative ${
        selected ? "bg-surface border-nutri shadow-lg" : "bg-surface border-border hover:border-border-strong"
      } ${loading ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-muted">Match</span>
        <span className="bg-nutri/20 text-nutri text-xs font-bold px-2 py-0.5 rounded-full">{Math.round(meal.score)}%</span>
      </div>

      <div>
        <h4 className="font-bold text-text text-base max-w-[70%] leading-snug">{meal.name}</h4>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-xs text-muted flex items-center gap-1">🏪 {meal.restaurant}</span>
          {meal.distance_km !== undefined && (
            <span className="text-[10px] bg-surface-2 text-muted px-1.5 py-0.5 rounded-full font-medium">📍 {meal.distance_km} km</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 bg-surface-2 border border-border rounded-xl p-3 text-xs">
        <div>
          <span className="text-subtle text-[10px] uppercase font-bold tracking-wider">Protein</span>
          <p className="font-semibold text-text text-sm mt-0.5">{meal.protein}</p>
          <span className="text-[9px] text-subtle">{isEstimated ? "Estimated" : "Verified"}</span>
        </div>
        <div>
          <span className="text-subtle text-[10px] uppercase font-bold tracking-wider">Calories</span>
          <p className="font-semibold text-text text-sm mt-0.5">{meal.calories}</p>
          <span className="text-[9px] text-subtle">{isEstimated ? "Estimated" : "Verified"}</span>
        </div>
      </div>

      {isEstimated && (
        <div className="flex items-center justify-between text-[10px] text-subtle border-t border-border pt-2">
          <span>Nutrition Confidence:</span>
          <span
            className={`font-semibold px-2 py-0.5 rounded-full ${
              confidence >= 0.8 ? "bg-nutri/10 text-nutri" : confidence >= 0.65 ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"
            }`}
          >
            {Math.round(confidence * 100)}% {confidence >= 0.8 ? "High" : confidence >= 0.65 ? "Med" : "Low"}
          </span>
        </div>
      )}

      {meal.distance_km !== undefined && meal.distance_km > 5 && (
        <div className="bg-warning/10 border border-warning/20 text-warning text-[11px] p-2.5 rounded-xl flex items-start gap-1.5 leading-normal">
          <span>⚠️</span>
          <span>Far distance ({meal.distance_km} km). Expect longer delivery times.</span>
        </div>
      )}

      {meal.why_this_meal && meal.why_this_meal.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Why this fits:</span>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-muted pl-1">
            {meal.why_this_meal.map((r, idx) => (
              <li key={idx} className="leading-relaxed">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {meal.tradeoffs && meal.tradeoffs.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-warning">Tradeoffs:</span>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-warning/90 pl-1">
            {meal.tradeoffs.map((t, idx) => (
              <li key={idx} className="leading-relaxed">{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted border-t border-border pt-2 mt-auto">
        <span>Delivery: {meal.eta}</span>
        <span className="font-bold text-text">Rs {meal.price}</span>
      </div>
    </div>
  );
}
