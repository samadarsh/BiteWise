import React, { useState } from "react";
import { UserProfile } from "../lib/api";

interface OnboardingPanelProps {
  profile: UserProfile;
  onSave: (updatedProfile: UserProfile) => void;
  loading: boolean;
}

const DIET_OPTIONS = [
  { id: "any", label: "Anything" },
  { id: "veg", label: "Vegetarian" },
  { id: "non-veg", label: "Non-Vegetarian" },
];

const CUISINE_OPTIONS = ["North Indian", "South Indian", "Chinese", "Italian", "Continental", "Mexican", "Thai"];

export default function OnboardingPanel({ profile, onSave, loading }: OnboardingPanelProps) {
  const [age, setAge] = useState<string>(profile.age ? String(profile.age) : "");
  const [gender, setGender] = useState<string>(profile.gender || "male");
  const [height, setHeight] = useState<string>(profile.height_cm ? String(profile.height_cm) : "");
  const [weight, setWeight] = useState<string>(profile.weight_kg ? String(profile.weight_kg) : "");
  const [activityLevel, setActivityLevel] = useState<string>(profile.activity_level || "moderate");
  const [budget, setBudget] = useState<number>(profile.meal_budget_default || 300);
  const [goal, setGoal] = useState<string>(profile.fitness_goal || "maintenance");
  const [dietPreference, setDietPreference] = useState<string>(profile.diet_preference || "any");
  const [favoriteCuisines, setFavoriteCuisines] = useState<string[]>(profile.favorite_cuisines || []);

  const toggleCuisine = (cuisine: string) => {
    setFavoriteCuisines((prev) => (prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...profile,
      age: age ? parseInt(age) : null,
      gender,
      height_cm: height ? parseFloat(height) : null,
      weight_kg: weight ? parseFloat(weight) : null,
      activity_level: activityLevel,
      meal_budget_default: budget,
      fitness_goal: goal,
      diet_preference: dietPreference,
      favorite_cuisines: favoriteCuisines,
    });
  };

  const fieldCls =
    "w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder:text-subtle focus:outline-none focus:border-nutri transition";
  const labelCls = "block text-xs font-semibold text-muted mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border p-8 rounded-2xl shadow-xl w-full max-w-xl mx-auto flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-xl font-bold text-text">Set Up Your Profile</h3>
        <p className="text-xs text-muted mt-1">Biometrics for precise macro targets, plus what you actually like to eat</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Age</label>
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 28" className={fieldCls} required />
        </div>
        <div>
          <label className={labelCls}>Gender</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)} className={fieldCls}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Height (cm)</label>
          <input type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g. 175" className={fieldCls} required />
        </div>
        <div>
          <label className={labelCls}>Weight (kg)</label>
          <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 70" className={fieldCls} required />
        </div>
      </div>

      <div>
        <label className={labelCls}>Daily Activity Level</label>
        <select value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)} className={fieldCls}>
          <option value="sedentary">Sedentary (Desk job, little exercise)</option>
          <option value="light">Lightly Active (Light exercise 1-3 days/wk)</option>
          <option value="moderate">Moderately Active (Moderate exercise 3-5 days/wk)</option>
          <option value="active">Active (Hard exercise 6-7 days/wk)</option>
          <option value="very_active">Very Active (Athletic daily training)</option>
        </select>
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

      <div className="border-t border-border pt-5 flex flex-col gap-5">
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
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-nutri hover:brightness-105 disabled:opacity-50 text-nutri-contrast font-bold py-3 rounded-xl transition text-sm shadow-md flex items-center justify-center gap-2 mt-2"
      >
        {loading ? "Saving Profile…" : "Save Profile & Get Recommendations"}
      </button>
    </form>
  );
}
