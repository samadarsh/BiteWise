import React from "react";
import { PriorityWeights } from "../PriorityControls";

interface ConfirmStepProps {
  age: string;
  goal: string;
  dietPreference: string;
  weights: PriorityWeights;
  loading: boolean;
  onFinish: () => void;
  onBack: () => void;
}

const GOAL_LABELS: Record<string, string> = {
  muscle_gain: "Muscle Gain",
  fat_loss: "Fat Loss",
  maintenance: "Maintenance",
};

const DIET_LABELS: Record<string, string> = {
  any: "Anything",
  veg: "Vegetarian",
  "non-veg": "Non-Vegetarian",
};

export default function ConfirmStep({ age, goal, dietPreference, weights, loading, onFinish, onBack }: ConfirmStepProps) {
  const topPriority = Object.entries(weights).sort(([, a], [, b]) => b - a)[0];
  const topPriorityLabel = topPriority?.[0]?.replace("_priority", "").replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="bg-surface border border-border p-8 rounded-2xl shadow-xl w-full flex flex-col gap-6 text-center">
      <div className="h-14 w-14 bg-nutri rounded-2xl flex items-center justify-center text-2xl shadow-lg mx-auto">✅</div>
      <div>
        <h3 className="text-xl font-bold text-text">You&apos;re all set</h3>
        <p className="text-xs text-muted mt-1">Here&apos;s what your Coach will track from here.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-left">
        <div className="bg-surface-2 border border-border rounded-xl p-3">
          <p className="text-[9px] text-subtle uppercase font-bold tracking-wider">Age</p>
          <p className="text-sm font-bold text-text mt-1">{age || "—"}</p>
        </div>
        <div className="bg-surface-2 border border-border rounded-xl p-3">
          <p className="text-[9px] text-subtle uppercase font-bold tracking-wider">Goal</p>
          <p className="text-sm font-bold text-text mt-1">{GOAL_LABELS[goal] || goal}</p>
        </div>
        <div className="bg-surface-2 border border-border rounded-xl p-3">
          <p className="text-[9px] text-subtle uppercase font-bold tracking-wider">Diet</p>
          <p className="text-sm font-bold text-text mt-1">{DIET_LABELS[dietPreference] || dietPreference}</p>
        </div>
      </div>

      {topPriorityLabel && (
        <p className="text-xs text-subtle">
          Recommendations will especially favor <span className="text-nutri font-semibold">{topPriorityLabel}</span> — tune this anytime from Preferences.
        </p>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="px-5 py-3 rounded-xl border border-border text-text font-semibold text-sm hover:bg-surface-2 transition">
          Back
        </button>
        <button
          onClick={onFinish}
          disabled={loading}
          className="flex-1 bg-nutri hover:brightness-105 disabled:opacity-50 text-nutri-contrast font-bold py-3.5 rounded-xl transition text-sm shadow-md"
        >
          {loading ? "Saving…" : "Start Tracking"}
        </button>
      </div>
    </div>
  );
}
