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
    <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          👨‍👩‍👧‍👦 Family Members
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs font-semibold px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-slate-950 transition"
        >
          {showAddForm ? "Cancel" : "Add Member"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Spouse, Child"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Dietary Preference</label>
            <select
              value={dietary}
              onChange={e => setDietary(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="any">Any Diet</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Allergies (comma-separated)</label>
            <input
              type="text"
              value={allergiesInput}
              onChange={e => setAllergiesInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              placeholder="e.g. peanuts, dairy"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Calorie Target</label>
              <input
                type="number"
                value={calories}
                onChange={e => setCalories(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder="kcal"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Protein Target (g)</label>
              <input
                type="number"
                value={protein}
                onChange={e => setProtein(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder="g"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 font-bold py-2 rounded text-sm transition"
          >
            {loading ? "Adding..." : "Confirm Add"}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {members.map(member => (
          <div key={member.id} className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 flex justify-between items-center">
            <div className="flex flex-col gap-1 text-left">
              <p className="font-bold text-white text-sm">{member.name}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {member.dietary_preference}
                </span>
                {member.allergies.map(all => (
                  <span key={all} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    ⚠️ {all}
                  </span>
                ))}
              </div>
              {(member.calorie_target || member.protein_target) && (
                <p className="text-xs text-slate-400 mt-1">
                  Targets: {member.calorie_target || "-"} kcal | {member.protein_target || "-"}g protein
                </p>
              )}
            </div>
            {member.user_id ? (
              <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Primary
              </span>
            ) : (
              <button
                onClick={() => onDeleteMember(member.id)}
                className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 rounded hover:bg-rose-500/10 transition"
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
