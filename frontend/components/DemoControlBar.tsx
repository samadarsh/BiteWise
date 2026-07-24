import React from "react";

interface DemoControlBarProps {
  onSeed: () => Promise<void>;
  onReset: () => Promise<void>;
  loading: boolean;
}

export default function DemoControlBar({ onSeed, onReset, loading }: DemoControlBarProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nutri opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-nutri" />
        </span>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-text">Live Demo</h4>
          <p className="text-[11px] text-subtle mt-0.5">Load or reset sample data to explore the platform.</p>
        </div>
      </div>
      <div className="flex gap-2 w-full md:w-auto">
        <button
          onClick={onSeed}
          disabled={loading}
          className="flex-1 md:flex-initial bg-nutri hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed text-nutri-contrast font-bold px-4 py-2 rounded-lg text-xs transition"
        >
          {loading ? "Loading…" : "Load Demo Data"}
        </button>
        <button
          onClick={onReset}
          disabled={loading}
          className="flex-1 md:flex-initial bg-surface-2 hover:bg-surface-3 border border-border disabled:opacity-50 disabled:cursor-not-allowed text-muted font-bold px-4 py-2 rounded-lg text-xs transition"
        >
          {loading ? "Resetting…" : "Reset"}
        </button>
      </div>
    </div>
  );
}
