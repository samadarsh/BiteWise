import React from "react";
import PriorityControls, { PriorityWeights } from "../PriorityControls";

interface RankingStepProps {
  weights: PriorityWeights;
  onChange: (weights: PriorityWeights) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function RankingStep({ weights, onChange, onNext, onBack }: RankingStepProps) {
  return (
    <div className="w-full flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-xl font-bold text-text">How should we rank meals for you?</h3>
        <p className="text-xs text-muted mt-1">Defaults are balanced — tune any of these now, or come back later from Preferences.</p>
      </div>

      <PriorityControls weights={weights} onChange={onChange} />

      <div className="flex gap-3">
        <button onClick={onBack} className="px-5 py-3 rounded-xl border border-border text-text font-semibold text-sm hover:bg-surface-2 transition">
          Back
        </button>
        <button onClick={onNext} className="flex-1 bg-nutri hover:brightness-105 text-nutri-contrast font-bold py-3 rounded-xl transition text-sm shadow-md">
          Continue
        </button>
      </div>
    </div>
  );
}
