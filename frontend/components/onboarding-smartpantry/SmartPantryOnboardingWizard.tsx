"use client";

import React, { useState } from "react";
import { HouseholdMember } from "../../lib/api";
import StockStep from "./StockStep";
import CookQueryStep from "./CookQueryStep";
import HouseholdStep from "./HouseholdStep";

interface SmartPantryOnboardingWizardProps {
  members: HouseholdMember[];
  onQuickStock: (items: { item_name: string; category: string; stock_level: string; is_bulk: boolean }[]) => Promise<void>;
  onAddGrocery: (item: { item_name: string; quantity: number; unit: string }) => Promise<void>;
  onAddMember: (member: { name: string; dietary_preference: string; allergies: string[]; calorie_target?: number; protein_target?: number }) => Promise<void>;
  onDeleteMember: (id: string) => Promise<void>;
  onComplete: () => void;
}

const STEP_LABELS = ["Stock", "Cook", "Household"];

export default function SmartPantryOnboardingWizard({ members, onQuickStock, onAddGrocery, onAddMember, onDeleteMember, onComplete }: SmartPantryOnboardingWizardProps) {
  const [step, setStep] = useState(0);

  // Stocking the pantry in step 1 updates context state immediately (for the
  // instant "here's what you can cook" payoff in step 2) — so completion must
  // be an explicit signal from the last step, not derived from pantry state,
  // or the wizard would look like it "finished" the moment step 1 succeeds.
  const next = () => setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-center gap-2">
        {STEP_LABELS.map((label, idx) => (
          <div
            key={label}
            className={`h-1.5 rounded-full transition-all duration-300 ${idx === step ? "w-8 bg-pantry" : idx < step ? "w-4 bg-pantry/40" : "w-4 bg-border"}`}
            title={label}
          />
        ))}
      </div>

      {step === 0 && <StockStep onQuickStock={onQuickStock} onNext={next} />}
      {step === 1 && <CookQueryStep onAddGrocery={onAddGrocery} onNext={next} onBack={back} />}
      {step === 2 && (
        <HouseholdStep members={members} onAddMember={onAddMember} onDeleteMember={onDeleteMember} onFinish={onComplete} onBack={back} />
      )}
    </div>
  );
}
