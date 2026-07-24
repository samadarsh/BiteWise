import React from "react";

export interface PriorityWeights {
  [key: string]: number;
  protein_priority: number;
  calorie_priority: number;
  budget_priority: number;
  speed_priority: number;
  taste_priority: number;
  clean_eating_priority: number;
}

interface PriorityControlsProps {
  weights: PriorityWeights;
  onChange: (weights: PriorityWeights) => void;
}

export default function PriorityControls({ weights, onChange }: PriorityControlsProps) {
  const handleSliderChange = (key: keyof PriorityWeights, val: number) => {
    onChange({ ...weights, [key]: val });
  };

  const sliders: Array<{ key: keyof PriorityWeights; label: string; min: number; max: number; desc: string }> = [
    { key: "protein_priority", label: "Protein Focus", min: 0.5, max: 2.0, desc: "Weights high protein meals heavily" },
    { key: "calorie_priority", label: "Calorie Compliance", min: 0.5, max: 2.0, desc: "Tolerates less calorie variance" },
    { key: "budget_priority", label: "Budget Friendly", min: 0.5, max: 2.0, desc: "Favors lower-priced options" },
    { key: "speed_priority", label: "Delivery Speed", min: 0.5, max: 2.0, desc: "Prioritizes faster delivery ETAs" },
    { key: "taste_priority", label: "Restaurant Rating", min: 0.5, max: 2.0, desc: "Favors highly rated restaurants" },
    { key: "clean_eating_priority", label: "Clean Eating", min: 1.0, max: 2.0, desc: "Penalizes low-confidence estimated macros" },
  ];

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
      <div>
        <h4 className="text-sm font-bold text-text">Personalized Ranking Controls</h4>
        <p className="text-[11px] text-muted mt-0.5">Tune these weights to change how recommendations are sorted.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sliders.map((s) => (
          <div key={s.key} className="bg-surface-2 border border-border rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text">{s.label}</span>
              <span className="text-[11px] font-bold text-nutri bg-nutri/10 px-2 py-0.5 rounded-full">{weights[s.key].toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step="0.1"
              value={weights[s.key]}
              onChange={(e) => handleSliderChange(s.key, parseFloat(e.target.value))}
              className="w-full h-1 rounded-lg appearance-none cursor-pointer accent-nutri mt-2"
            />
            <span className="text-[10px] text-subtle mt-1">{s.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
