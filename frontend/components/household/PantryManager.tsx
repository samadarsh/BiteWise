import React, { useState } from "react";
import { PantryItem } from "../../lib/api";
import QuickStockModal from "./QuickStockModal";
import { useDashboard } from "../../lib/dashboard-context";

interface PantryManagerProps {
  pantry: PantryItem[];
  onAddOrUpdateItem: (item: { item_name: string; stock_level?: string; category?: string; expiry_date?: string; is_bulk?: boolean }) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onQuickStock?: (items: { item_name: string; category: string; stock_level: string; is_bulk: boolean }[]) => Promise<void>;
}

const STOCK_LEVELS = [
  { level: "full", label: "Full", color: "bg-nutri", text: "text-nutri", border: "border-nutri/30", bg: "bg-nutri/10", fill: 4 },
  { level: "half", label: "Half", color: "bg-yellow-500", text: "text-warning", border: "border-warning/30", bg: "bg-warning/10", fill: 2 },
  { level: "low", label: "Low", color: "bg-pantry", text: "text-brand", border: "border-brand/30", bg: "bg-brand/10", fill: 1 },
  { level: "empty", label: "Empty", color: "bg-danger", text: "text-danger", border: "border-danger/30", bg: "bg-danger/10", fill: 0 }
];

const CATEGORY_COLORS: Record<string, string> = {
  Dairy: "bg-info/10 text-info border-info/20",
  Proteins: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  Vegetables: "bg-warning/10 text-warning border-warning/20",
  Staples: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Spices: "bg-brand/10 text-brand border-brand/20",
  Bakery: "bg-yellow-600/10 text-yellow-500 border-yellow-600/20",
  Other: "bg-surface-3 text-muted border-border"
};

export default function PantryManager({ pantry, onAddOrUpdateItem, onDeleteItem, onQuickStock }: PantryManagerProps) {
  const { showAlert } = useDashboard();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showQuickStock, setShowQuickStock] = useState(false);
  const [name, setName] = useState("");
  const [stockLevel, setStockLevel] = useState<string>("full");
  const [category, setCategory] = useState("Staples");
  const [expiryDate, setExpiryDate] = useState("");
  const [isBulk, setIsBulk] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onAddOrUpdateItem({
        item_name: name.trim(),
        stock_level: stockLevel,
        category: category,
        expiry_date: expiryDate || undefined,
        is_bulk: isBulk,
      });

      // Reset
      setName("");
      setStockLevel("full");
      setCategory("Staples");
      setExpiryDate("");
      setIsBulk(false);
      setShowAddForm(false);
    } catch (err) {
      showAlert(`Failed to update pantry: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCycleStock = async (item: PantryItem) => {
    const currentIndex = STOCK_LEVELS.findIndex((s) => s.level === item.stock_level);
    const nextIndex = (currentIndex + 1) % STOCK_LEVELS.length;
    const nextLevel = STOCK_LEVELS[nextIndex].level;

    try {
      await onAddOrUpdateItem({
        item_name: item.item_name,
        stock_level: nextLevel,
        category: item.category,
        is_bulk: item.is_bulk,
      });
    } catch (err) {
      showAlert(`Failed to update stock level: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDeleteItem(id);
    } catch (err) {
      showAlert(`Failed to delete item: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const getStockDetails = (levelStr: string) => {
    return STOCK_LEVELS.find((s) => s.level === levelStr) || STOCK_LEVELS[3];
  };

  const getDaysRemaining = (expiryDateStr?: string | null) => {
    if (!expiryDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDateStr);
    expiry.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="bg-surface backdrop-blur-md border border-border rounded-2xl p-6 shadow-xl flex flex-col gap-6 text-left">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-border pb-4 gap-3">
        <h3 className="text-lg font-bold text-text flex items-center gap-2">
          🥫 Pantry Inventory
        </h3>
        <div className="flex gap-2">
          {onQuickStock && (
            <button
              onClick={() => setShowQuickStock(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded bg-nutri/10 border border-nutri/20 text-nutri hover:bg-nutri/20 transition"
            >
              ⚡ Quick Stock Templates
            </button>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs font-semibold px-3 py-1.5 rounded bg-surface-3 hover:bg-border text-text transition"
          >
            {showAddForm ? "Cancel" : "Add/Update Item"}
          </button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted mb-1">Item Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text focus:outline-none focus:border-nutri"
                placeholder="e.g. Milk, Eggs, Rice"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text focus:outline-none focus:border-nutri"
              >
                <option value="Staples">Staples</option>
                <option value="Dairy">Dairy</option>
                <option value="Proteins">Proteins</option>
                <option value="Vegetables">Vegetables</option>
                <option value="Spices">Spices</option>
                <option value="Bakery">Bakery</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Manual Expiry (Optional)</label>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-sm text-text focus:outline-none focus:border-nutri"
              />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-2">
              <label className="block text-xs font-semibold text-muted">Stock Level</label>
              <div className="grid grid-cols-4 gap-2">
                {STOCK_LEVELS.map((lvl) => (
                  <button
                    key={lvl.level}
                    type="button"
                    onClick={() => setStockLevel(lvl.level)}
                    className={`py-2 text-xs font-semibold rounded-lg border transition ${
                      stockLevel === lvl.level
                        ? `${lvl.bg} ${lvl.border} ${lvl.text} ring-1 ring-offset-1 ring-offset-surface ring-nutri`
                        : "bg-surface border-border text-muted hover:border-border-strong"
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2 py-1">
              <label className="flex items-center gap-2 text-xs text-muted font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isBulk}
                  onChange={e => setIsBulk(e.target.checked)}
                  className="rounded border-border-strong text-nutri focus:ring-nutri bg-surface"
                />
                <span>Is Bulk Item? (Oil, Salt, Spices — decrements slowly)</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-nutri hover:brightness-105 disabled:opacity-50 text-nutri-contrast font-bold py-2 rounded text-sm transition"
          >
            {loading ? "Saving..." : "Add to Inventory"}
          </button>
        </form>
      )}

      {pantry.length === 0 ? (
        <div className="py-12 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-center px-4 gap-4">
          <span className="text-3xl">🫙</span>
          <div>
            <p className="text-sm font-semibold text-muted">Your pantry is empty</p>
            <p className="text-xs text-subtle mt-1 max-w-sm">
              Pre-populate your kitchen instantly using onboarding templates or add items manually.
            </p>
          </div>
          {onQuickStock && (
            <button
              onClick={() => setShowQuickStock(true)}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-nutri hover:brightness-105 text-nutri-contrast transition shadow-lg shadow-nutri/10"
            >
              ⚡ Quick Stock from Templates
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {pantry.map((item) => {
            const stock = getStockDetails(item.stock_level);
            const daysLeft = getDaysRemaining(item.expiry_date);
            const categoryClass = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other;

            return (
              <div
                key={item.id}
                className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col justify-between gap-4 group hover:border-border-strong transition"
              >
                {/* Info */}
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="text-sm font-bold text-text leading-tight">{item.item_name}</h4>
                    <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border shrink-0 ${categoryClass}`}>
                      {item.category}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-subtle font-mono">
                    {item.is_bulk && (
                      <span className="bg-surface-3 px-1 py-0.5 rounded uppercase font-bold text-nutri">
                        Bulk (Use: {item.bulk_use_count})
                      </span>
                    )}
                    {daysLeft !== null && item.stock_level !== "empty" && (
                      <span className={`px-1 py-0.5 rounded uppercase font-bold ${
                        daysLeft <= 1 ? "bg-danger/10 text-danger border border-danger/20" : "bg-surface-3 text-muted"
                      }`}>
                        {daysLeft <= 0 ? "Expired" : daysLeft === 1 ? "Expires tomorrow" : `Expires in ${daysLeft}d`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Battery Meter */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-semibold">
                    <span className="text-muted">Stock Level</span>
                    <span className={stock.text}>{stock.label}</span>
                  </div>
                  {/* Visual segments */}
                  <div className="flex h-2 bg-surface border border-border rounded overflow-hidden p-[1px] gap-[2px]">
                    {[1, 2, 3, 4].map((seg) => (
                      <div
                        key={seg}
                        className={`flex-1 rounded-[1px] transition-colors duration-500 ${
                          stock.fill >= seg ? stock.color : "bg-surface-2"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center border-t border-border pt-3">
                  <button
                    onClick={() => handleCycleStock(item)}
                    className="text-[10px] font-bold text-muted hover:text-nutri flex items-center gap-1 transition"
                  >
                    🔄 Adjust Level
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-[10px] font-bold text-danger hover:text-danger transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onQuickStock && (
        <QuickStockModal
          isOpen={showQuickStock}
          onClose={() => setShowQuickStock(false)}
          onStock={onQuickStock}
        />
      )}
    </div>
  );
}
