"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Utensils, ShoppingBag, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";

export function SmartPantryShowcase() {
  const [activeView, setActiveView] = useState<"pantry" | "recipes" | "grocery">("pantry");

  const PANTRY_ITEMS = [
    { name: "Paneer", category: "Proteins", stock: "Full", level: 100, status: "ok" },
    { name: "Basmati Rice", category: "Staples", stock: "Half", level: 50, status: "ok" },
    { name: "Milk", category: "Dairy", stock: "Low", level: 20, status: "warning" },
    { name: "Toor Dal", category: "Staples", stock: "Empty", level: 0, status: "danger" },
    { name: "Atta (Wheat)", category: "Staples", stock: "Full", level: 100, status: "ok" },
    { name: "Tomatoes", category: "Vegetables", stock: "Half", level: 50, status: "ok" },
  ];

  return (
    <div className="rounded-2xl border border-pantry/25 bg-surface-2 p-5 sm:p-7 shadow-2xl relative overflow-hidden">
      {/* Glow effect */}
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-pantry/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Controls */}
      <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 rounded-full bg-pantry animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider text-pantry">SmartPantry Live Engine</span>
        </div>
        <div className="flex items-center gap-1 bg-surface border border-border p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveView("pantry")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              activeView === "pantry"
                ? "bg-pantry text-pantry-contrast shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            Pantry Stock
          </button>
          <button
            type="button"
            onClick={() => setActiveView("recipes")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              activeView === "recipes"
                ? "bg-pantry text-pantry-contrast shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            Recipe Match
          </button>
          <button
            type="button"
            onClick={() => setActiveView("grocery")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              activeView === "grocery"
                ? "bg-pantry text-pantry-contrast shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            Instamart Sync
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeView === "pantry" && (
          <motion.div
            key="pantry"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Warning Banner */}
            <div className="p-3 rounded-xl bg-pantry/10 border border-pantry/30 text-xs text-text flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-pantry shrink-0" />
                <p className="font-semibold">
                  <strong className="text-pantry">2 Items Low or Out:</strong> Milk (Low), Toor Dal (Empty). Auto-queued to grocery list!
                </p>
              </div>
            </div>

            {/* Battery Stock Inventory Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PANTRY_ITEMS.map((item) => (
                <div
                  key={item.name}
                  className="p-3 rounded-xl bg-surface border border-border flex flex-col justify-between space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-text">{item.name}</h5>
                      <span className="text-[10px] text-subtle">{item.category}</span>
                    </div>
                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        item.status === "danger"
                          ? "bg-danger/20 text-danger border border-danger/30"
                          : item.status === "warning"
                          ? "bg-warning/20 text-warning border border-warning/30"
                          : "bg-success/20 text-success border border-success/30"
                      }`}
                    >
                      {item.stock}
                    </span>
                  </div>

                  {/* Battery Level Indicator */}
                  <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.status === "danger"
                          ? "bg-danger"
                          : item.status === "warning"
                          ? "bg-warning"
                          : "bg-success"
                      }`}
                      style={{ width: `${item.level}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeView === "recipes" && (
          <motion.div
            key="recipes"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Recipe Match Card */}
            <div className="rounded-xl border border-pantry/30 bg-surface p-4 sm:p-5 shadow-lg space-y-4">
              <div className="flex justify-between items-center border-b border-border pb-3">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-pantry/15 text-pantry border border-pantry/30">
                    90% Ready to Cook
                  </span>
                  <h4 className="text-base font-black text-text mt-1">Paneer Butter Masala &amp; Jeera Rice</h4>
                </div>
                <Utensils className="h-5 w-5 text-pantry" />
              </div>

              {/* Ingredient Coverage Pills */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-subtle uppercase tracking-wider block">Pantry Coverage Check</span>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-success/10 border border-success/30 text-success font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Paneer (Stocked)
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-success/10 border border-success/30 text-success font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Basmati Rice (Stocked)
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-success/10 border border-success/30 text-success font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Tomatoes &amp; Spices (Stocked)
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-danger/10 border border-danger/30 text-danger font-semibold flex items-center gap-1">
                    ⚠️ Heavy Cream (Missing - Auto Added)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-pantry/8 border border-pantry/20 text-xs text-muted">
                💡 <strong className="text-text font-bold">Auto-Decrement:</strong> Clicking &quot;Cook Recipe&quot; will automatically adjust Paneer &amp; Rice stock levels in your household ledger.
              </div>
            </div>
          </motion.div>
        )}

        {activeView === "grocery" && (
          <motion.div
            key="grocery"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Instamart Sync Preview */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-pantry" />
                  <span className="text-xs font-bold text-text">Swiggy Instamart Smart Sync</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-pantry/15 text-pantry border border-pantry/30">
                  Categorized &amp; Prioritized
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2 rounded bg-danger/10 border border-danger/20 flex justify-between items-center text-danger font-semibold">
                  <span>🚨 Urgent: Milk (500ml), Heavy Cream (100g)</span>
                  <span>Est. ₹120</span>
                </div>
                <div className="p-2 rounded bg-warning/10 border border-warning/20 flex justify-between items-center text-warning font-semibold">
                  <span>⏰ Soon: Toor Dal (1kg), Onions (1kg)</span>
                  <span>Est. ₹140</span>
                </div>
                <div className="p-2 rounded bg-surface-2 border border-border flex justify-between items-center text-subtle">
                  <span>🟢 Optional: Fresh Coriander</span>
                  <span>Est. ₹20</span>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center font-black text-sm text-text border-t border-border">
                <span>Total Estimated Grocery Bill</span>
                <span className="text-pantry">₹280</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
