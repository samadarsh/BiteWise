import React from "react";

export interface StockTemplateItem {
  name: string;
  category: string;
  is_bulk: boolean;
}

interface QuickStockChecklistProps {
  templates: Record<string, StockTemplateItem[]>;
  selectedItems: Record<string, boolean>;
  toggleItem: (name: string) => void;
  onSelectAll: (check: boolean) => void;
}

export default function QuickStockChecklist({ templates, selectedItems, toggleItem, onSelectAll }: QuickStockChecklistProps) {
  return (
    <div className="space-y-6">
      <div className="flex gap-3 text-xs mb-2">
        <button onClick={() => onSelectAll(true)} className="px-2.5 py-1 bg-surface-3 text-muted rounded hover:bg-border transition">
          Select All
        </button>
        <button onClick={() => onSelectAll(false)} className="px-2.5 py-1 bg-surface-3 text-muted rounded hover:bg-border transition">
          Deselect All
        </button>
      </div>

      {Object.entries(templates).map(([category, items]) => (
        <div key={category} className="space-y-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-pantry border-b border-border pb-1">{category}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {items.map((item) => {
              const isChecked = !!selectedItems[item.name];
              return (
                <label
                  key={item.name}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition ${
                    isChecked ? "bg-pantry/10 border-pantry/30 text-pantry" : "bg-surface-2 border-border text-subtle hover:border-border-strong"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleItem(item.name)}
                    className="rounded border-border-strong text-pantry focus:ring-pantry bg-surface"
                  />
                  <span>{item.name}</span>
                  {item.is_bulk && (
                    <span className="ml-auto text-[8px] bg-surface-3 text-muted px-1 py-0.5 rounded uppercase font-mono tracking-wide">Bulk</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
