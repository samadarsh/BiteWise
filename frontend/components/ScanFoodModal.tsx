import React from "react";
import ScanFoodPanel from "./ScanFoodPanel";

interface ScanFoodModalProps {
  onAdd: (entry: {
    meal_name: string;
    calories: number;
    protein_g: number;
    carbs_g?: number;
    fat_g?: number;
    source?: string;
    confidence?: number;
    is_estimated?: boolean;
    micronutrients?: Record<string, string> | null;
  }) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

export default function ScanFoodModal({ onAdd, onClose, loading }: ScanFoodModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border p-8 rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-6 text-left">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-text">Scan Your Meal</h3>
            <p className="text-xs text-muted mt-1">Snap a photo — AI identifies the food and estimates calories, protein &amp; more.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-subtle hover:text-text transition text-lg leading-none shrink-0"
          >
            ✕
          </button>
        </div>

        <ScanFoodPanel onAdd={onAdd} loading={loading} />
      </div>
    </div>
  );
}
