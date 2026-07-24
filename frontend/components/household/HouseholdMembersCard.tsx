import React, { useState } from "react";
import { HouseholdMember } from "../../lib/api";

interface HouseholdMembersCardProps {
  members: HouseholdMember[];
  onAddMember: (member: { name: string; dietary_preference: string; allergies: string[]; calorie_target?: number; protein_target?: number }) => Promise<void>;
  onDeleteMember: (id: string) => Promise<void>;
}

export default function HouseholdMembersCard({ members, onAddMember, onDeleteMember }: HouseholdMembersCardProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [dietary, setDietary] = useState("any");
  const [allergiesInput, setAllergiesInput] = useState("");
  const [calories, setCalories] = useState<number | "">("");
  const [protein, setProtein] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const allergyList = allergiesInput
        .split(",")
        .map(a => a.trim().toLowerCase())
        .filter(a => a !== "");

      await onAddMember({
        name: name.trim(),
        dietary_preference: dietary,
        allergies: allergyList,
        calorie_target: calories ? Number(calories) : undefined,
        protein_target: protein ? Number(protein) : undefined,
      });

      // Reset
      setName("");
      setDietary("any");
      setAllergiesInput("");
      setCalories("");
      setProtein("");
      setShowAddForm(false);
    } catch (err) {
      alert("Failed to add member: " + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface backdrop-blur-md border border-border rounded-2xl p-6 shadow-xl flex flex-col gap-6">
      <div className="flex justify-between items-center border-b border-border pb-4">
        <h3 className="text-lg font-bold text-text flex items-center gap-2">
          👨‍👩‍👧‍👦 Family Members
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs font-semibold px-3 py-1.5 rounded bg-nutri hover:brightness-105 text-nutri-contrast transition"
        >
          {showAddForm ? "Cancel" : "Add Member"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text focus:outline-none focus:border-nutri"
              placeholder="e.g. Spouse, Child"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Dietary Preference</label>
            <select
              value={dietary}
              onChange={e => setDietary(e.target.value)}
              className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text focus:outline-none focus:border-nutri"
            >
              <option value="any">Any Diet</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Allergies (comma-separated)</label>
            <input
              type="text"
              value={allergiesInput}
              onChange={e => setAllergiesInput(e.target.value)}
              className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text focus:outline-none focus:border-nutri"
              placeholder="e.g. peanuts, dairy"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Calorie Target</label>
              <input
                type="number"
                value={calories}
                onChange={e => setCalories(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text focus:outline-none focus:border-nutri"
                placeholder="kcal"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Protein Target (g)</label>
              <input
                type="number"
                value={protein}
                onChange={e => setProtein(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text focus:outline-none focus:border-nutri"
                placeholder="g"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-nutri hover:brightness-105 disabled:opacity-50 text-nutri-contrast font-bold py-2 rounded text-sm transition"
          >
            {loading ? "Adding..." : "Confirm Add"}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {members.map(member => (
          <div key={member.id} className="bg-surface-2 border border-border rounded-xl p-4 flex justify-between items-center">
            <div className="flex flex-col gap-1 text-left">
              <p className="font-bold text-text text-sm">{member.name}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-surface-3 text-muted">
                  {member.dietary_preference}
                </span>
                {member.allergies.map(all => (
                  <span key={all} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-danger/10 text-danger border border-danger/20">
                    ⚠️ {all}
                  </span>
                ))}
              </div>
              {(member.calorie_target || member.protein_target) && (
                <p className="text-xs text-muted mt-1">
                  Targets: {member.calorie_target || "-"} kcal | {member.protein_target || "-"}g protein
                </p>
              )}
            </div>
            {member.user_id ? (
              <span className="text-[10px] font-bold px-2 py-1 rounded bg-info/10 text-info border border-info/20">
                Primary
              </span>
            ) : (
              <button
                onClick={() => onDeleteMember(member.id)}
                className="text-xs text-danger hover:text-danger font-semibold px-2 py-1 rounded hover:bg-danger/10 transition"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
