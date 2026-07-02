import React from "react";

export interface RelaxationOption {
  label: string;
  patch: Record<string, any>;
  impact: string;
}

interface RelaxationOptionsProps {
  options: RelaxationOption[];
  onApplyPatch: (patch: Record<string, any>) => void;
  loading: boolean;
}

export default function RelaxationOptions({ options, onApplyPatch, loading }: RelaxationOptionsProps) {
  if (!options || options.length === 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-2xl flex flex-col gap-4 max-w-xl mx-auto w-full text-left">
      <div>
        <h4 className="text-sm font-bold text-amber-400 flex items-center gap-1.5">
          ⚠️ No strict matches found. Try relaxing a constraint:
        </h4>
        <p className="text-xs text-slate-400 mt-1">
          Adjusting these parameters will broaden your search field while keeping targets as close as possible.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => onApplyPatch(opt.patch)}
            disabled={loading}
            className="w-full bg-slate-950/80 border border-slate-800 hover:border-amber-500/50 disabled:opacity-50 hover:bg-slate-900 rounded-xl p-3.5 text-left text-xs transition flex flex-col gap-1 cursor-pointer"
          >
            <span className="font-bold text-slate-200">{opt.label}</span>
            <span className="text-[11px] text-slate-400">{opt.impact}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
