import React from "react";

interface BiometricsStepProps {
  age: string;
  setAge: (v: string) => void;
  gender: string;
  setGender: (v: string) => void;
  height: string;
  setHeight: (v: string) => void;
  weight: string;
  setWeight: (v: string) => void;
  activityLevel: string;
  setActivityLevel: (v: string) => void;
  canContinue: boolean;
  onNext: () => void;
  onBack: () => void;
}

const fieldCls =
  "w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder:text-subtle focus:outline-none focus:border-nutri transition";
const labelCls = "block text-xs font-semibold text-muted mb-1.5";

export default function BiometricsStep({
  age,
  setAge,
  gender,
  setGender,
  height,
  setHeight,
  weight,
  setWeight,
  activityLevel,
  setActivityLevel,
  canContinue,
  onNext,
  onBack,
}: BiometricsStepProps) {
  return (
    <div className="bg-surface border border-border p-8 rounded-2xl shadow-xl w-full flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-xl font-bold text-text">Your Biometrics</h3>
        <p className="text-xs text-muted mt-1">We calculate precise daily energy expenditure &amp; meal macro targets</p>
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

      <div className="flex gap-3 mt-2">
        <button onClick={onBack} className="px-5 py-3 rounded-xl border border-border text-text font-semibold text-sm hover:bg-surface-2 transition">
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!canContinue}
          className="flex-1 bg-nutri hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed text-nutri-contrast font-bold py-3 rounded-xl transition text-sm shadow-md"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
