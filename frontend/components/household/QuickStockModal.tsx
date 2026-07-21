import React, { useState } from "react";

const ONBOARDING_TEMPLATES = {
  "Staples & Grains": [
    { name: "Rice", category: "Staples", is_bulk: true },
    { name: "Atta", category: "Staples", is_bulk: true },
    { name: "Toor Dal", category: "Staples", is_bulk: true },
    { name: "Moong Dal", category: "Staples", is_bulk: true },
    { name: "Poha", category: "Staples", is_bulk: false },
    { name: "Oats", category: "Staples", is_bulk: false },
    { name: "Sugar", category: "Staples", is_bulk: true },
  ],
  "Dairy": [
    { name: "Milk", category: "Dairy", is_bulk: false },
    { name: "Curd", category: "Dairy", is_bulk: false },
    { name: "Paneer", category: "Dairy", is_bulk: false },
    { name: "Butter", category: "Dairy", is_bulk: false },
    { name: "Cheese", category: "Dairy", is_bulk: false },
    { name: "Ghee", category: "Dairy", is_bulk: true },
  ],
  "Proteins": [
    { name: "Eggs", category: "Proteins", is_bulk: false },
    { name: "Chicken", category: "Proteins", is_bulk: false },
    { name: "Tofu", category: "Proteins", is_bulk: false },
    { name: "Soya Chunks", category: "Proteins", is_bulk: false },
  ],
  "Vegetables": [
    { name: "Onion", category: "Vegetables", is_bulk: true },
    { name: "Tomato", category: "Vegetables", is_bulk: false },
    { name: "Potato", category: "Vegetables", is_bulk: true },
    { name: "Green Chilli", category: "Vegetables", is_bulk: false },
    { name: "Ginger", category: "Vegetables", is_bulk: true },
    { name: "Garlic", category: "Vegetables", is_bulk: true },
  ],
  "Oils & Spices": [
    { name: "Oil", category: "Spices", is_bulk: true },
    { name: "Salt", category: "Spices", is_bulk: true },
    { name: "Turmeric", category: "Spices", is_bulk: true },
    { name: "Cumin", category: "Spices", is_bulk: true },
    { name: "Chilli Powder", category: "Spices", is_bulk: true },
  ]
};

interface QuickStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStock: (items: { item_name: string; category: string; stock_level: string; is_bulk: boolean }[]) => Promise<void>;
}

export default function QuickStockModal({ isOpen, onClose, onStock }: QuickStockModalProps) {
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    Object.values(ONBOARDING_TEMPLATES).forEach((items) => {
      items.forEach((item) => {
        initial[item.name] = true; // Checked by default
      });
    });
    return initial;
  });

  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const toggleItem = (name: string) => {
    setSelectedItems((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSelectAll = (check: boolean) => {
    const updated: Record<string, boolean> = {};
    Object.values(ONBOARDING_TEMPLATES).forEach((items) => {
      items.forEach((item) => {
        updated[item.name] = check;
      });
    });
    setSelectedItems(updated);
  };

  const handleSubmit = async () => {
    setLoading(true);
    const toStock: { item_name: string; category: string; stock_level: string; is_bulk: boolean }[] = [];
    Object.entries(ONBOARDING_TEMPLATES).forEach(([, items]) => {
      items.forEach((item) => {
        if (selectedItems[item.name]) {
          toStock.push({
            item_name: item.name,
            category: item.category,
            stock_level: "full",
            is_bulk: item.is_bulk
          });
        }
      });
    });

    try {
      await onStock(toStock);
      onClose();
    } catch (err) {
      alert("Failed to quick stock: " + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              🍚 Quick Stock Your Kitchen
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Select common items you currently have at home to pre-populate your pantry.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition text-xl p-1"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="flex gap-3 text-xs mb-2">
            <button
              onClick={() => handleSelectAll(true)}
              className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition"
            >
              Select All
            </button>
            <button
              onClick={() => handleSelectAll(false)}
              className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition"
            >
              Deselect All
            </button>
          </div>

          {Object.entries(ONBOARDING_TEMPLATES).map(([category, items]) => (
            <div key={category} className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 border-b border-slate-800/60 pb-1">
                {category}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {items.map((item) => {
                  const isChecked = !!selectedItems[item.name];
                  return (
                    <label
                      key={item.name}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition ${
                        isChecked
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-slate-950/40 border-slate-800 text-slate-500 hover:border-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(item.name)}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                      />
                      <span>{item.name}</span>
                      {item.is_bulk && (
                        <span className="ml-auto text-[8px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded uppercase font-mono tracking-wide">
                          Bulk
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 flex justify-between items-center bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-300 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/10 transition"
          >
            {loading ? "Stocking..." : "Stock Checked Items (Full) →"}
          </button>
        </div>
      </div>
    </div>
  );
}
