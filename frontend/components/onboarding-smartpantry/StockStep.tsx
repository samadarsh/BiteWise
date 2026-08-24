import React, { useState } from "react";
import QuickStockChecklist from "../household/QuickStockChecklist";
import { ONBOARDING_TEMPLATES } from "../household/QuickStockModal";
import { useDashboard } from "../../lib/dashboard-context";

interface StockStepProps {
  onQuickStock: (items: { item_name: string; category: string; stock_level: string; is_bulk: boolean }[]) => Promise<void>;
  onNext: () => void;
}

export default function StockStep({ onQuickStock, onNext }: StockStepProps) {
  const { showAlert } = useDashboard();
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    Object.values(ONBOARDING_TEMPLATES).forEach((items) => {
      items.forEach((item) => {
        initial[item.name] = true;
      });
    });
    return initial;
  });
  const [loading, setLoading] = useState(false);

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

  const canContinue = Object.values(selectedItems).some(Boolean);

  const handleContinue = async () => {
    setLoading(true);
    const toStock: { item_name: string; category: string; stock_level: string; is_bulk: boolean }[] = [];
    Object.entries(ONBOARDING_TEMPLATES).forEach(([, items]) => {
      items.forEach((item) => {
        if (selectedItems[item.name]) {
          toStock.push({ item_name: item.name, category: item.category, stock_level: "full", is_bulk: item.is_bulk });
        }
      });
    });
    try {
      await onQuickStock(toStock);
      onNext();
    } catch (err) {
      showAlert(`Failed to stock your pantry: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface border border-border p-8 rounded-2xl shadow-xl w-full flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-xl font-bold text-text">What do you already have at home?</h3>
        <p className="text-xs text-muted mt-1">Tap what&apos;s in your kitchen — we&apos;ll track it from here so you only ever buy what you&apos;re missing.</p>
      </div>

      <div className="max-h-[380px] overflow-y-auto pr-1">
        <QuickStockChecklist templates={ONBOARDING_TEMPLATES} selectedItems={selectedItems} toggleItem={toggleItem} onSelectAll={handleSelectAll} />
      </div>

      <button
        onClick={handleContinue}
        disabled={!canContinue || loading}
        className="w-full bg-pantry hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed text-pantry-contrast font-bold py-3 rounded-xl transition text-sm shadow-md"
      >
        {loading ? "Stocking your pantry…" : "Continue"}
      </button>
      {!canContinue && <p className="text-[11px] text-subtle text-center -mt-2">Select at least one item to continue — this is what we&apos;ll track.</p>}
    </div>
  );
}
