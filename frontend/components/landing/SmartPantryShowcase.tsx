"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, AlertTriangle, CheckCircle2 } from "lucide-react";

export function SmartPantryShowcase() {
  const [activeView, setActiveView] = useState<"pantry" | "recipes" | "grocery">("pantry");

  const PANTRY_ITEMS = [
    { name: "Paneer Block", category: "Proteins", stock: "Full", level: 100, status: "ok" },
    { name: "Basmati Rice", category: "Staples", stock: "Half", level: 50, status: "ok" },
    { name: "Fresh Milk", category: "Dairy", stock: "Low", level: 20, status: "warning" },
    { name: "Toor Dal", category: "Staples", stock: "Empty", level: 0, status: "danger" },
    { name: "Atta (Wheat)", category: "Staples", stock: "Full", level: 100, status: "ok" },
    { name: "Tomatoes", category: "Vegetables", stock: "Half", level: 50, status: "ok" },
  ];

  return (
    <div className="rounded-2xl border border-pantry/30 bg-[#0c1017] p-5 sm:p-7 shadow-2xl relative overflow-hidden text-white">
      {/* Glow effect */}
      <div className="absolute -top-16 -right-16 w-56 h-56 bg-pantry/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Controls */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 rounded-full bg-pantry animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider text-pantry">SmartPantry Live Engine</span>
        </div>
        <div className="flex items-center gap-1 bg-[#111826] border border-white/10 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveView("pantry")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              activeView === "pantry"
                ? "bg-pantry text-pantry-contrast shadow-sm"
                : "text-white/60 hover:text-white"
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
                : "text-white/60 hover:text-white"
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
                : "text-white/60 hover:text-white"
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
            {/* Organic Pantry Photography Banner */}
            <div className="relative h-40 w-full rounded-xl overflow-hidden border border-white/10">
              <Image
                src="/images/fresh_pantry_ingredients.png"
                alt="Fresh Organic Pantry Ingredients"
                fill
                sizes="(max-width: 768px) 100vw, 500px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c1017] via-transparent to-black/40" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-pantry text-pantry-contrast shadow-lg">
                  Indian Kitchen Quick-Stock
                </span>
                <span className="text-xs font-bold bg-[#111826]/90 border border-white/20 text-white px-2.5 py-1 rounded-full backdrop-blur-md">
                  30 Items Stocked
                </span>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="p-3 rounded-xl bg-pantry/15 border border-pantry/30 text-xs text-white flex items-center justify-between">
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
                  className="p-3 rounded-xl bg-[#111826] border border-white/10 flex flex-col justify-between space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-white">{item.name}</h5>
                      <span className="text-[10px] text-white/50">{item.category}</span>
                    </div>
                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        item.status === "danger"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : item.status === "warning"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {item.stock}
                    </span>
                  </div>

                  {/* Battery Level Indicator */}
                  <div className="h-1.5 w-full bg-[#0c1017] rounded-full overflow-hidden border border-white/5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.status === "danger"
                          ? "bg-rose-500"
                          : item.status === "warning"
                          ? "bg-amber-500"
                          : "bg-emerald-400"
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
            {/* Recipe Match Card with Photography */}
            <div className="rounded-xl border border-pantry/40 bg-[#111826] p-4 sm:p-5 shadow-2xl space-y-4 overflow-hidden relative group">
              <div className="relative h-44 sm:h-52 w-full rounded-lg overflow-hidden border border-white/10">
                <Image
                  src="/images/paneer_masala_dish.png"
                  alt="Paneer Butter Masala & Naan"
                  fill
                  sizes="(max-width: 768px) 100vw, 500px"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111826] via-transparent to-black/30" />
                <div className="absolute top-3 left-3">
                  <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-pantry text-pantry-contrast shadow-lg">
                    90% Ready to Cook
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <span className="text-lg font-black text-white drop-shadow">Paneer Butter Masala &amp; Naan</span>
                  <span className="text-xs font-bold bg-[#111826]/90 border border-white/20 text-white px-2.5 py-1 rounded-full backdrop-blur-md">
                    Prep: 15 Mins
                  </span>
                </div>
              </div>

              {/* Ingredient Coverage Pills */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-white/50 uppercase tracking-wider block">Pantry Ingredient Coverage</span>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Paneer Block (Stocked)
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Tomatoes &amp; Spices (Stocked)
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold flex items-center gap-1">
                    ⚠️ Heavy Cream (Missing - Auto Queued)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-pantry/10 border border-pantry/25 text-xs text-white/80">
                💡 <strong className="text-white font-bold">Auto-Decrement:</strong> Marking &quot;Cook Recipe&quot; will automatically adjust Paneer &amp; Spice stock levels in your household ledger.
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
            <div className="rounded-xl border border-white/10 bg-[#111826] p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-pantry" />
                  <span className="text-xs font-bold text-white">Swiggy Instamart Smart Sync</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-pantry/20 text-pantry border border-pantry/30">
                  Categorized &amp; Prioritized
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex justify-between items-center text-rose-300 font-semibold">
                  <span>🚨 Urgent: Fresh Milk (500ml), Heavy Cream (100g)</span>
                  <span>Est. ₹120</span>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex justify-between items-center text-amber-300 font-semibold">
                  <span>⏰ Soon: Toor Dal (1kg), Onions (1kg)</span>
                  <span>Est. ₹140</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0c1017] border border-white/10 flex justify-between items-center text-white/60">
                  <span>🟢 Optional: Fresh Coriander Leaves</span>
                  <span>Est. ₹20</span>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center font-black text-sm text-white border-t border-white/10">
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
