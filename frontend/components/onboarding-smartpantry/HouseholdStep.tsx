import React from "react";
import { HouseholdMember } from "../../lib/api";
import HouseholdMembersCard from "../household/HouseholdMembersCard";

interface HouseholdStepProps {
  members: HouseholdMember[];
  onAddMember: (member: { name: string; dietary_preference: string; allergies: string[]; calorie_target?: number; protein_target?: number }) => Promise<void>;
  onDeleteMember: (id: string) => Promise<void>;
  onFinish: () => void;
  onBack: () => void;
}

export default function HouseholdStep({ members, onAddMember, onDeleteMember, onFinish, onBack }: HouseholdStepProps) {
  return (
    <div className="w-full flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-xl font-bold text-text">Who else are you cooking for?</h3>
        <p className="text-xs text-muted mt-1">Add family members with a different diet or allergies — recipe suggestions filter around everyone, not just you. Optional, edit anytime.</p>
      </div>

      <HouseholdMembersCard members={members} onAddMember={onAddMember} onDeleteMember={onDeleteMember} />

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="px-5 py-3 rounded-xl border border-border text-text font-semibold text-sm hover:bg-surface-2 transition">
          Back
        </button>
        <button onClick={onFinish} className="flex-1 bg-pantry hover:brightness-105 text-pantry-contrast font-bold py-3 rounded-xl transition text-sm shadow-md">
          Take Me to My Kitchen
        </button>
      </div>
    </div>
  );
}
