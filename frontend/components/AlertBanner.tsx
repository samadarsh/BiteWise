import React from "react";

interface AlertBannerProps {
  message: string;
  type?: "success" | "error" | "warning" | "info";
  onClose?: () => void;
}

export default function AlertBanner({ message, type = "info", onClose }: AlertBannerProps) {
  if (!message) return null;

  const styles = {
    success: {
      bg: "bg-emerald-500/5",
      border: "border-emerald-500/20",
      text: "text-emerald-400",
      label: "Success"
    },
    error: {
      bg: "bg-rose-500/5",
      border: "border-rose-500/20",
      text: "text-rose-400",
      label: "Error"
    },
    warning: {
      bg: "bg-amber-500/5",
      border: "border-amber-500/20",
      text: "text-amber-400",
      label: "Warning"
    },
    info: {
      bg: "bg-indigo-500/5",
      border: "border-indigo-500/20",
      text: "text-indigo-400",
      label: "Info"
    }
  };

  const config = styles[type];

  return (
    <div className={`p-4 rounded-xl border flex justify-between items-start gap-3 transition ${config.bg} ${config.border} ${config.text}`}>
      <div className="flex items-start gap-2.5 text-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider">{config.label}</span>
        <div className="leading-relaxed">
          <p className="font-semibold">{message}</p>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 text-sm font-bold leading-none cursor-pointer focus:outline-none"
        >
          ×
        </button>
      )}
    </div>
  );
}
