import React, { useState } from "react";
import QuickStockChecklist from "./QuickStockChecklist";

export const ONBOARDING_TEMPLATES = {
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
      <div className="bg-surface border border-border rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center bg-surface-2">
          <div>
            <h3 className="text-lg font-bold text-text flex items-center gap-2">
              🍚 Quick Stock Your Kitchen
            </h3>
            <p className="text-xs text-muted mt-1">
              Select common items you currently have at home to pre-populate your pantry.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-text transition text-xl p-1"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          <QuickStockChecklist templates={ONBOARDING_TEMPLATES} selectedItems={selectedItems} toggleItem={toggleItem} onSelectAll={handleSelectAll} />
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-between items-center bg-surface-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-border text-sm font-semibold text-muted transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-pantry hover:brightness-105 disabled:opacity-50 text-pantry-contrast font-bold text-sm shadow-lg shadow-pantry/10 transition"
          >
            {loading ? "Stocking..." : "Stock Checked Items (Full) →"}
          </button>
        </div>
      </div>
    </div>
  );
}
