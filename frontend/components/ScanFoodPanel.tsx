import React, { useState, useRef } from "react";
import { api, FoodScanResult } from "../lib/api";

interface ScanFoodPanelProps {
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
  loading: boolean;
}

export default function ScanFoodPanel({ onAdd, loading }: ScanFoodPanelProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FoodScanResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable, pre-filled from the scan result — never saved unreviewed.
  const [mealName, setMealName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setScanning(true);
    try {
      const scanResult = await api.scanFoodImage(file);
      setResult(scanResult);
      setMealName(scanResult.food_name);
      setCalories(String(scanResult.calories));
      setProtein(String(scanResult.protein_g));
      setCarbs(String(scanResult.carbs_g));
      setFat(String(scanResult.fat_g));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mealName.trim() || !calories || !protein || !result) return;
    try {
      await onAdd({
        meal_name: mealName,
        calories: parseFloat(calories),
        protein_g: parseFloat(protein),
        carbs_g: carbs ? parseFloat(carbs) : undefined,
        fat_g: fat ? parseFloat(fat) : undefined,
        source: "image_scan",
        confidence: result.confidence,
        is_estimated: true,
        micronutrients: result.micronutrients,
      });
      setResult(null);
      setMealName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const inputCls =
    "bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-subtle focus:outline-none focus:border-nutri transition disabled:opacity-50";

  const confidenceLabel = result
    ? result.confidence >= 0.7
      ? { text: "High confidence", cls: "text-nutri" }
      : result.confidence >= 0.5
        ? { text: "Medium confidence", cls: "text-warning" }
        : { text: "Low confidence — please double-check", cls: "text-danger" }
    : null;

  return (
    <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-3">
      <span className="text-subtle font-bold uppercase tracking-wider text-[10px]">📷 Scan Food</span>

      {!result && (
        <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border-strong rounded-lg py-6 cursor-pointer hover:border-nutri/50 transition text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelected}
            disabled={scanning}
            className="hidden"
          />
          <span className="text-2xl">{scanning ? "🔎" : "📸"}</span>
          <span className="text-xs text-muted">{scanning ? "Analyzing photo…" : "Tap to take or choose a photo"}</span>
        </label>
      )}

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div className="bg-surface border border-border rounded-lg p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-text">{result.food_name}</span>
              {confidenceLabel && (
                <span className={`text-[9px] font-bold uppercase tracking-wider shrink-0 ${confidenceLabel.cls}`}>
                  {confidenceLabel.text}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted">{result.description}</p>
            <p className="text-[10px] text-subtle">Estimated portion: {result.estimated_portion}</p>
            {Object.keys(result.micronutrients).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(result.micronutrients).map(([k, v]) => (
                  <span key={k} className="text-[9px] bg-surface-3 text-subtle px-1.5 py-0.5 rounded uppercase font-bold">
                    {k}: {v}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-subtle italic mt-1">⚠️ {result.caveats}</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-subtle uppercase font-bold tracking-wider">Meal Name</label>
            <input type="text" value={mealName} onChange={(e) => setMealName(e.target.value)} required disabled={loading} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-subtle uppercase font-bold tracking-wider">Calories (kcal)</label>
              <input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} required min="0" disabled={loading} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-subtle uppercase font-bold tracking-wider">Protein (g)</label>
              <input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} required min="0" disabled={loading} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-subtle uppercase font-bold tracking-wider">Carbs (g)</label>
              <input type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} min="0" disabled={loading} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-subtle uppercase font-bold tracking-wider">Fat (g)</label>
              <input type="number" value={fat} onChange={(e) => setFat(e.target.value)} min="0" disabled={loading} className={inputCls} />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
              disabled={loading}
              className="flex-1 bg-surface hover:bg-surface-3 border border-border disabled:opacity-50 text-muted font-bold py-2 rounded-lg text-xs transition uppercase tracking-wider"
            >
              Retake
            </button>
            <button
              type="submit"
              disabled={loading || !mealName.trim() || !calories || !protein}
              className="flex-1 bg-surface-3 hover:bg-border border border-border disabled:opacity-50 disabled:cursor-not-allowed text-text font-bold py-2 rounded-lg text-xs transition uppercase tracking-wider"
            >
              {loading ? "Saving…" : "Save Entry"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
