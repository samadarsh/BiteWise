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
      onClick={() => !loading && onSelect(meal)}
      className={`border rounded-2xl p-5 transition text-left cursor-pointer flex flex-col gap-3 relative ${
        selected
          ? "bg-slate-900 border-emerald-500 shadow-xl shadow-emerald-500/10"
          : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
      } ${loading ? "opacity-60 pointer-events-none" : ""}`}
    >
      {/* Match Score Badge */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-slate-400">Match Score</span>
        <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-full">
          {Math.round(meal.score)}%
        </span>
      </div>

      <div>
        <h4 className="font-bold text-slate-100 text-base max-w-[70%] leading-snug">{meal.name}</h4>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-xs text-slate-400 flex items-center gap-1">🏪 {meal.restaurant}</span>
          {meal.distance_km !== undefined && (
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded-full font-medium">
              📍 {meal.distance_km} km
            </span>
          )}
        </div>
      </div>

      {/* Macro Indicators */}
      <div className="grid grid-cols-2 gap-3 bg-slate-950/80 border border-slate-900 rounded-xl p-3 text-xs">
        <div>
          <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Protein</span>
          <p className="font-semibold text-slate-200 text-sm mt-0.5">{meal.protein}</p>
          <span className="text-[9px] text-slate-500">{isEstimated ? "Estimated" : "Verified"}</span>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Calories</span>
          <p className="font-semibold text-slate-200 text-sm mt-0.5">{meal.calories}</p>
          <span className="text-[9px] text-slate-500">{isEstimated ? "Estimated" : "Verified"}</span>
        </div>
      </div>

      {/* Confidence Indicator */}
      {isEstimated && (
        <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/60 pt-2">
          <span>Nutrition Confidence:</span>
          <span
            className={`font-semibold px-2 py-0.5 rounded-full ${
              confidence >= 0.8
                ? "bg-emerald-500/10 text-emerald-400"
                : confidence >= 0.65
                ? "bg-amber-500/10 text-amber-400"
                : "bg-rose-500/10 text-rose-400"
            }`}
          >
            {Math.round(confidence * 100)}% {confidence >= 0.8 ? "High" : confidence >= 0.65 ? "Med" : "Low"}
          </span>
        </div>
      )}

      {/* Distance Warning Banner */}
      {meal.distance_km !== undefined && meal.distance_km > 5 && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] p-2.5 rounded-xl flex items-start gap-1.5 leading-normal">
          <span>⚠️</span>
          <span>Far distance ({meal.distance_km} km). Expect longer delivery times.</span>
        </div>
      )}

      {/* Explanations & Why-This-Meal */}
      {meal.why_this_meal && meal.why_this_meal.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-slate-800/60 pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Why this fits:</span>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-300 pl-1">
            {meal.why_this_meal.map((r, idx) => (
              <li key={idx} className="leading-relaxed">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tradeoffs Warning */}
      {meal.tradeoffs && meal.tradeoffs.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-slate-800/60 pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Tradeoffs / Warnings:</span>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-300/80 pl-1">
            {meal.tradeoffs.map((t, idx) => (
              <li key={idx} className="leading-relaxed">{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/60 pt-2 mt-auto">
        <span>Delivery: {meal.eta}</span>
        <span className="font-bold text-slate-200">Rs {meal.price}</span>
      </div>
    </div>
  );
}
