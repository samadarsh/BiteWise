import React from "react";

export interface RelaxationOption {
  label: string;
  patch: Record<string, unknown>;
  impact: string;
}

interface RelaxationOptionsProps {
  options: RelaxationOption[];
  onApplyPatch: (patch: Record<string, unknown>) => void;
  loading: boolean;
}

export default function RelaxationOptions({ options, onApplyPatch, loading }: RelaxationOptionsProps) {
  if (!options || options.length === 0) return null;

  return (
    <div className="bg-warning/10 border border-warning/20 p-6 rounded-2xl flex flex-col gap-4 w-full text-left">
      <div>
        <h4 className="text-sm font-bold text-warning flex items-center gap-1.5">⚠️ No strict matches. Try relaxing a constraint:</h4>
        <p className="text-xs text-muted mt-1">These broaden the search while staying as close to your targets as possible.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => onApplyPatch(opt.patch)}
            disabled={loading}
            className="w-full bg-surface border border-border hover:border-warning/50 disabled:opacity-50 rounded-xl p-3.5 text-left text-xs transition flex flex-col gap-1 cursor-pointer"
          >
            <span className="font-bold text-text">{opt.label}</span>
            <span className="text-[11px] text-muted">{opt.impact}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
