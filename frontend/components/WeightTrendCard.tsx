import React, { useState } from "react";
import { WeightEntry } from "../lib/api";

interface WeightTrendCardProps {
  entries: WeightEntry[];
  currentWeight: number | null;
  onLogWeight: (weightKg: number) => Promise<void>;
  logging: boolean;
}

export default function WeightTrendCard({ entries, currentWeight, onLogWeight, logging }: WeightTrendCardProps) {
  const [input, setInput] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(input);
    if (!val || val <= 0) return;
    await onLogWeight(val);
    setInput("");
  };

  const sparkline = (() => {
    if (entries.length < 2) return null;
    const weights = entries.map((e) => e.weight_kg);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const range = max - min || 1;
    const width = 200;
    const height = 40;
    const points = entries.map((e, i) => {
      const x = (i / (entries.length - 1)) * width;
      const y = height - ((e.weight_kg - min) / range) * height;
      return `${x},${y}`;
    });
    const first = entries[0].weight_kg;
    const last = entries[entries.length - 1].weight_kg;
    const trendColor = last <= first ? "text-nutri" : "text-warning";
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className={`w-full h-10 ${trendColor}`} preserveAspectRatio="none">
        <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={width} cy={height - ((last - min) / range) * height} r="3" fill="currentColor" />
      </svg>
    );
  })();

  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-subtle font-bold uppercase tracking-wider text-[10px]">⚖️ Weight Trend</span>
        {currentWeight != null && <span className="text-sm font-bold text-text">{currentWeight}kg</span>}
      </div>

      {sparkline ? (
        <div className="w-full">{sparkline}</div>
      ) : (
        <p className="text-[11px] text-subtle">Log a few readings to see your trend here.</p>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="number"
          step="0.1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Today's weight (kg)"
          className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text placeholder:text-subtle focus:outline-none focus:border-nutri"
        />
        <button
          type="submit"
          disabled={logging || !input}
          className="shrink-0 bg-nutri hover:brightness-105 disabled:opacity-50 text-nutri-contrast font-bold text-xs px-3 py-1.5 rounded-lg transition"
        >
          {logging ? "Saving…" : "Log"}
        </button>
      </form>
    </div>
  );
}
