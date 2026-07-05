import React, { useState, useEffect, useCallback } from "react";
import { api, GroceryList, GroupedGroceryResponse, GroceryGroup, GroupedGroceryItem } from "../../lib/api";

interface RecipeMatchItem {
  name: string;
  quantity: number;
  unit: string;
  reason?: string;
}

interface RecipeMatchResult {
  success: boolean;
  recipe_plan_id: string;
  added_to_grocery_list: RecipeMatchItem[];
  available_in_pantry: RecipeMatchItem[];
}

interface GroceryListPanelProps {
  list: GroceryList | null;
  onAddItem: (item: { item_name: string; quantity: number; unit: string }) => Promise<void>;
  onToggleItem: (id: string, isPurchased: boolean) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onMatchRecipe: (recipe: { recipe_name: string; ingredients: { name: string; qty: number; unit: string }[]; planned_for_date: string }) => Promise<RecipeMatchResult>;
}

export default function GroceryListPanel({ list, onAddItem, onToggleItem, onDeleteItem, onMatchRecipe }: GroceryListPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState<number | "">(1);
  const [unit, setUnit] = useState("unit");
  const [loading, setLoading] = useState(false);

  // Recipe match simulation inputs
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [recipeName, setRecipeName] = useState("Butter Chicken & Rice");
  const [ingredientsText, setIngredientsText] = useState(
    "chicken: 0.5: kg\nrice: 0.5: kg\nbutter: 0.1: kg\ntomato: 0.3: kg\nlemon: 2: unit"
  );
  const [matchResult, setMatchResult] = useState<RecipeMatchResult | null>(null);

  // Grouped view state (Sprint 11)
  const [viewMode, setViewMode] = useState<"flat" | "grouped">("flat");
  const [groupedData, setGroupedData] = useState<GroupedGroceryResponse | null>(null);
  const [groupedLoading, setGroupedLoading] = useState(false);

  const loadGroupedView = useCallback(async () => {
    setGroupedLoading(true);
    try {
      const res = await api.getGroupedGroceryList();
      setGroupedData(res);
    } catch {
      // Fall back to flat view
      setViewMode("flat");
    } finally {
      setGroupedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "grouped") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadGroupedView();
    }
  }, [viewMode, loadGroupedView]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || quantity === "") return;
    setLoading(true);
    try {
      await onAddItem({
        item_name: name.trim(),
        quantity: Number(quantity),
        unit: unit,
      });
      setName("");
      setQuantity(1);
      setUnit("unit");
      setShowAddForm(false);
    } catch (err) {
      alert("Failed to add grocery item: " + err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecipeMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMatchResult(null);
    try {
      // Parse ingredient lines: name: qty: unit
      const ingredients = ingredientsText
        .split("\n")
        .map(line => {
          const parts = line.split(":");
          if (parts.length >= 3) {
            return {
              name: parts[0].trim(),
              qty: Number(parts[1].trim()),
              unit: parts[2].trim(),
            };
          }
          return null;
        })
        .filter((ing): ing is { name: string; qty: number; unit: string } => ing !== null);

      const today = new Date().toISOString().split("T")[0];
      const res = await onMatchRecipe({
        recipe_name: recipeName,
        ingredients,
        planned_for_date: today,
      });
      setMatchResult(res);
    } catch (err) {
      alert("Recipe matching failed: " + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          🛒 Shopping Grocery List
        </h3>
        <div className="flex gap-2">
          {/* View Toggle (Sprint 11) */}
          <div className="flex rounded overflow-hidden border border-slate-700">
            <button
              onClick={() => setViewMode("flat")}
              className={`text-[10px] font-semibold px-2 py-1 transition ${
                viewMode === "flat" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("grouped")}
              className={`text-[10px] font-semibold px-2 py-1 transition ${
                viewMode === "grouped" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Grouped
            </button>
          </div>
          <button
            onClick={() => {
              setShowRecipeForm(!showRecipeForm);
              setShowAddForm(false);
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-white transition"
          >
            🍳 Plan Recipe
          </button>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              setShowRecipeForm(false);
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-slate-950 transition"
          >
            {showAddForm ? "Cancel" : "Add Item"}
          </button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddItem} className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Item Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder="e.g. Eggs, Tomatoes"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Quantity</label>
              <input
                type="number"
                step="any"
                required
                value={quantity}
                onChange={e => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
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
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 font-bold py-2 rounded text-sm transition"
          >
            {loading ? "Adding..." : "Add to List"}
          </button>
        </form>
      )}

      {showRecipeForm && (
        <form onSubmit={handleRecipeMatch} className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 text-left">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">🍳 Missing Ingredients Scanner</h4>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 mb-1">Recipe Name</label>
            <input
              type="text"
              required
              value={recipeName}
              onChange={e => setRecipeName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 mb-1">Ingredients (name:qty:unit - one per line)</label>
            <textarea
              required
              rows={5}
              value={ingredientsText}
              onChange={e => setIngredientsText(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-800 text-white font-bold py-2 rounded text-xs transition"
          >
            {loading ? "Scanning Pantry..." : "Scan & Add Missing Ingredients"}
          </button>

          {matchResult && (
            <div className="mt-3 p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs space-y-2">
              <p className="font-bold text-white">Match Output:</p>
              
              {matchResult.added_to_grocery_list.length > 0 ? (
                <div>
                  <p className="text-amber-400 font-semibold">🛒 Added to Grocery List:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                    {matchResult.added_to_grocery_list.map((item: RecipeMatchItem) => (
                      <li key={item.name}>
                        {item.name} ({item.quantity} {item.unit}) - <span className="text-[10px] text-slate-500">{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-emerald-400 font-semibold">✨ All ingredients are fully in-stock in pantry!</p>
              )}

              {matchResult.available_in_pantry.length > 0 && (
                <div>
                  <p className="text-emerald-400 font-semibold">✅ In-Stock in Pantry (Skipped):</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                    {matchResult.available_in_pantry.map((item: RecipeMatchItem) => (
                      <li key={item.name}>
                        {item.name} ({item.quantity} {item.unit})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {/* Grouped View (Sprint 11) */}
      {viewMode === "grouped" ? (
        <div className="flex flex-col gap-3">
          {groupedLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
            </div>
          ) : !groupedData || groupedData.groups.length === 0 ? (
            <p className="py-6 text-center text-slate-500 text-sm">
              No unpurchased items to group.
            </p>
          ) : (
            <>
              {groupedData.high_priority_count > 0 && (
                <div className="text-[10px] font-bold text-rose-400">
                  🔴 {groupedData.high_priority_count} urgent item{groupedData.high_priority_count > 1 ? "s" : ""} need restocking
                </div>
              )}
              {groupedData.groups.map((group: GroceryGroup) => (
                <div key={group.category} className="border border-slate-800 rounded-xl overflow-hidden">
                  {/* Category Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-800/40">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{group.category}</span>
                      <span className="text-[10px] text-slate-500">({group.item_count})</span>
                    </div>
                    {group.priority_score >= 3 ? (
                      <span className="text-[9px] font-black text-rose-400 uppercase px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                        🔴 Urgent
                      </span>
                    ) : group.priority_score >= 1 ? (
                      <span className="text-[9px] font-black text-amber-400 uppercase px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                        🟡 Soon
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-slate-500 uppercase px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                        ⚪ Optional
                      </span>
                    )}
                  </div>
                  {/* Items */}
                  <div className="divide-y divide-slate-800/60">
                    {group.items.map((item: GroupedGroceryItem) => (
                      <div
                        key={item.id}
                        className={`px-4 py-2 flex justify-between items-center text-xs ${
                          item.priority === "urgent" ? "bg-rose-500/5" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{item.item_name}</span>
                          <span className="text-slate-500">
                            {item.quantity} {item.unit}
                          </span>
                          {item.priority === "urgent" && (
                            <span className="text-[8px] font-black text-rose-400">RESTOCK</span>
                          )}
                        </div>
                        <button
                          onClick={() => onDeleteItem(item.id)}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold px-1.5 py-0.5 rounded hover:bg-rose-500/10 transition"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        /* Flat View (existing) */
        <div className="flex flex-col gap-2">
          {(!list || !list.items || list.items.length === 0) ? (
            <p className="py-6 text-center text-slate-500 text-sm">
              Shopping list is currently empty. Add items or scan a recipe above!
            </p>
          ) : (
            list.items.map(item => (
              <div
                key={item.id}
                className={`bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 flex justify-between items-center transition ${item.is_purchased ? "opacity-45" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={item.is_purchased}
                    onChange={e => onToggleItem(item.id, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-800 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className={`text-sm font-semibold ${item.is_purchased ? "line-through text-slate-500" : "text-white"}`}>
                    {item.item_name}
                  </span>
                  <span className="text-xs text-slate-400">
                    ({item.quantity} {item.unit})
                  </span>
                </div>
                <button
                  onClick={() => onDeleteItem(item.id)}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 rounded hover:bg-rose-500/10 transition"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
