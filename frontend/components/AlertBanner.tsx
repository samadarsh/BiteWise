import React from "react";

interface AlertBannerProps {
  message: string;
  type?: "success" | "error" | "warning" | "info";
  onClose?: () => void;
}

export default function AlertBanner({ message, type = "info", onClose }: AlertBannerProps) {
  if (!message) return null;

  const config = {
    success: { cls: "bg-success/10 border-success/25 text-success", label: "Success" },
    error: { cls: "bg-danger/10 border-danger/25 text-danger", label: "Error" },
    warning: { cls: "bg-warning/10 border-warning/25 text-warning", label: "Warning" },
    info: { cls: "bg-info/10 border-info/25 text-info", label: "Info" },
  }[type];

  return (
    <div className={`p-4 rounded-xl border flex justify-between items-start gap-3 ${config.cls}`}>
      <div className="flex items-start gap-2.5 text-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5">{config.label}</span>
        <p className="font-semibold leading-relaxed">{message}</p>
      </div>
      {onClose && (
        <button onClick={onClose} className="text-current opacity-60 hover:opacity-100 text-sm font-bold leading-none cursor-pointer" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
