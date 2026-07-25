import React from "react";

interface GoalsDietStepProps {
  goal: string;
  setGoal: (v: string) => void;
  budget: number;
  setBudget: (v: number) => void;
  dietPreference: string;
  setDietPreference: (v: string) => void;
  favoriteCuisines: string[];
  toggleCuisine: (cuisine: string) => void;
  allergies: string[];
  toggleAllergy: (allergen: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const labelCls = "block text-xs font-semibold text-muted mb-1.5";
const fieldCls =
  "w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder:text-subtle focus:outline-none focus:border-nutri transition";

const DIET_OPTIONS = [
  { id: "any", label: "Anything" },
  { id: "veg", label: "Vegetarian" },
  { id: "non-veg", label: "Non-Vegetarian" },
];

const CUISINE_OPTIONS = ["North Indian", "South Indian", "Chinese", "Italian", "Continental", "Mexican", "Thai"];
const ALLERGY_OPTIONS = ["Gluten", "Dairy", "Nuts", "Soy", "Shellfish"];

export default function GoalsDietStep({
  goal,
  setGoal,
  budget,
  setBudget,
  dietPreference,
  setDietPreference,
  favoriteCuisines,
  toggleCuisine,
  allergies,
  toggleAllergy,
  onNext,
  onBack,
}: GoalsDietStepProps) {
  return (
    <div className="bg-surface border border-border p-8 rounded-2xl shadow-xl w-full flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-xl font-bold text-text">Goals &amp; Diet</h3>
        <p className="text-xs text-muted mt-1">What you&apos;re working toward, and what you actually eat</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Fitness Goal</label>
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className={fieldCls}>
            <option value="fat_loss">Fat Loss</option>
            <option value="maintenance">Maintenance</option>
            <option value="muscle_gain">Muscle Gain</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Default Meal Budget (Rs)</label>
          <input type="number" value={budget} onChange={(e) => setBudget(parseInt(e.target.value) || 300)} className={fieldCls} required />
        </div>
      </div>

      <div>
        <label className={labelCls}>Diet Preference</label>
        <div className="grid grid-cols-3 gap-2">
          {DIET_OPTIONS.map((opt) => {
            const active = dietPreference === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDietPreference(opt.id)}
                className={`text-xs font-semibold py-2.5 px-1 rounded-lg border transition ${active ? "bg-nutri border-nutri text-nutri-contrast font-bold" : "bg-surface-2 border-border text-muted hover:border-border-strong"}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={labelCls}>Favorite Cuisines (optional)</label>
        <div className="flex flex-wrap gap-2">
          {CUISINE_OPTIONS.map((cuisine) => {
            const selected = favoriteCuisines.includes(cuisine);
            return (
              <button
                key={cuisine}
                type="button"
                onClick={() => toggleCuisine(cuisine)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition ${selected ? "bg-nutri/10 border-nutri text-nutri font-semibold" : "bg-surface-2 border-border text-muted hover:border-border-strong"}`}
              >
                {selected ? "✓ " : ""}
                {cuisine}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={labelCls}>Exclusions / Allergies (optional)</label>
        <div className="flex flex-wrap gap-2">
          {ALLERGY_OPTIONS.map((allergen) => {
            const selected = allergies.includes(allergen);
            return (
              <button
                key={allergen}
                type="button"
                onClick={() => toggleAllergy(allergen)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${selected ? "bg-danger/10 border-danger text-danger" : "bg-surface-2 border-border text-muted hover:border-border-strong"}`}
              >
                {selected ? `❌ ${allergen}` : allergen}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 mt-2">
        <button onClick={onBack} className="px-5 py-3 rounded-xl border border-border text-text font-semibold text-sm hover:bg-surface-2 transition">
          Back
        </button>
        <button onClick={onNext} className="flex-1 bg-nutri hover:brightness-105 text-nutri-contrast font-bold py-3 rounded-xl transition text-sm shadow-md">
          Continue
        </button>
      </div>
    </div>
  );
}
