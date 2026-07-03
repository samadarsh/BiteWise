import React from "react";

interface DemoControlBarProps {
  onSeed: () => Promise<void>;
  onReset: () => Promise<void>;
  loading: boolean;
}

export default function DemoControlBar({ onSeed, onReset, loading }: DemoControlBarProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-lg">
      <div className="flex items-center gap-2">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
        </span>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Demo Mode Active</h4>
          <p className="text-[10px] text-slate-500 mt-0.5">Use the seed controls below to manage mock session state repeatably.</p>
        </div>
      </div>
      <div className="flex gap-2 w-full md:w-auto">
        <button
          onClick={onSeed}
          disabled={loading}
          className="flex-1 md:flex-initial bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-850 disabled:text-slate-600 text-slate-100 font-bold px-4 py-2 rounded-lg text-xs transition uppercase tracking-wider font-mono shadow-md shadow-indigo-600/10"
        >
          {loading ? "Seeding..." : "Seed Demo Data"}
        </button>
        <button
          onClick={onReset}
          disabled={loading}
          className="flex-1 md:flex-initial bg-slate-800 hover:bg-slate-700 disabled:bg-slate-850 disabled:text-slate-600 text-slate-300 font-bold px-4 py-2 rounded-lg text-xs transition uppercase tracking-wider font-mono"
        >
          {loading ? "Resetting..." : "Reset Session"}
        </button>
      </div>
    </div>
  );
}
