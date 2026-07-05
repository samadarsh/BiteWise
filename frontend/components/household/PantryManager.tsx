import React, { useState } from "react";
import { PantryItem } from "../../lib/api";

interface PantryManagerProps {
  pantry: PantryItem[];
  onAddOrUpdateItem: (item: { item_name: string; quantity: number; unit: string; min_threshold?: number }) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}

export default function PantryManager({ pantry, onAddOrUpdateItem, onDeleteItem }: PantryManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [unit, setUnit] = useState("unit");
  const [threshold, setThreshold] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || quantity === "") return;
    setLoading(true);
    try {
      await onAddOrUpdateItem({
        item_name: name.trim(),
        quantity: Number(quantity),
        unit: unit,
        min_threshold: threshold !== "" ? Number(threshold) : undefined,
      });

      // Reset
      setName("");
      setQuantity("");
      setUnit("unit");
      setThreshold("");
      setShowAddForm(false);
    } catch (err) {
      alert("Failed to update pantry: " + err);
    } finally {
      setLoading(false);
    }
  };

  const getStockStatus = (item: PantryItem) => {
    if (item.quantity <= 0) {
      return { label: "Out of Stock", class: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
    }
    if (item.min_threshold && item.quantity < item.min_threshold) {
      return { label: "Low Stock", class: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
    }
    return { label: "In Stock", class: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          🥫 Pantry Inventory
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs font-semibold px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-slate-950 transition"
        >
          {showAddForm ? "Cancel" : "Add/Update Item"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Item Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder="e.g. Milk, Eggs, Curd"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Current Qty</label>
              <input
                type="number"
                step="any"
                required
                value={quantity}
                onChange={e => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder="0.0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Unit</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="unit">unit</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
                <option value="ml">ml</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Min Restock Threshold (Optional)</label>
              <input
                type="number"
                step="any"
                value={threshold}
                onChange={e => setThreshold(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder="Auto-trigger shopping list if below this"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 font-bold py-2 rounded text-sm transition"
          >
            {loading ? "Saving..." : "Update Stock"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold">
              <th className="py-3 px-2">Item</th>
              <th className="py-3 px-2 text-center">In Stock</th>
              <th className="py-3 px-2 text-center">Min Target</th>
              <th className="py-3 px-2 text-center">Status</th>
              <th className="py-3 px-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {pantry.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500 text-sm">
                  No items in pantry yet. Seeding demo data will add items!
                </td>
              </tr>
            ) : (
              pantry.map(item => {
                const status = getStockStatus(item);
                return (
                  <tr key={item.id} className="border-b border-slate-800/60 hover:bg-slate-800/10 text-sm">
                    <td className="py-3 px-2 font-semibold text-white">{item.item_name}</td>
                    <td className="py-3 px-2 text-center text-slate-300">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="py-3 px-2 text-center text-slate-400">
                      {item.min_threshold ? `${item.min_threshold} ${item.unit}` : "-"}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${status.class}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <button
                        onClick={() => onDeleteItem(item.id)}
                        className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 rounded hover:bg-rose-500/10 transition"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
