"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, ShieldCheck, Clock, Tag, Sparkles, CheckCircle2, ChevronRight } from "lucide-react";

export function NutriOrderShowcase() {
  const [activeTab, setActiveTab] = useState<"ranking" | "checkout">("ranking");

  return (
    <div className="rounded-2xl border border-nutri/25 bg-surface-2 p-5 sm:p-7 shadow-2xl relative overflow-hidden">
      {/* Glow effect */}
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-nutri/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Controls */}
      <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 rounded-full bg-nutri animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider text-nutri">Live Swiggy MCP Preview</span>
        </div>
        <div className="flex items-center gap-1 bg-surface border border-border p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab("ranking")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "ranking"
                ? "bg-nutri text-nutri-contrast shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            AI Ranked Meal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("checkout")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "checkout"
                ? "bg-nutri text-nutri-contrast shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            Cart &amp; Dispatch
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "ranking" ? (
          <motion.div
            key="ranking"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {/* Top Match Card */}
            <div className="rounded-xl border border-nutri/30 bg-surface p-4 sm:p-5 shadow-lg relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-nutri/15 text-nutri border border-nutri/30">
                      94% Match Fit
                    </span>
                    <span className="text-xs text-subtle font-medium">Bikganai Biryani &amp; Bowls</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-black text-text mt-1">High-Protein Grilled Chicken Bowl</h4>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-xs text-subtle block">Swiggy Staging Price</span>
                  <span className="text-lg font-black text-nutri">₹320</span>
                </div>
              </div>

              {/* Macro Bars */}
              <div className="grid grid-cols-2 gap-3 my-4">
                <div className="bg-surface-2 p-3 rounded-lg border border-border">
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-bold text-muted">Protein Goal</span>
                    <span className="font-black text-nutri">42g / 40g</span>
                  </div>
                  <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-nutri rounded-full" style={{ width: "100%" }} />
                  </div>
                </div>

                <div className="bg-surface-2 p-3 rounded-lg border border-border">
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-bold text-muted">Calorie Limit</span>
                    <span className="font-black text-brand">580 / 650 kcal</span>
                  </div>
                  <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full" style={{ width: "89%" }} />
                  </div>
                </div>
              </div>

              {/* Factor Ratings */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px] pt-1">
                <div className="bg-surface-2 p-2 rounded-lg border border-border">
                  <span className="text-subtle block">Nutrition</span>
                  <span className="font-bold text-nutri">5/5 ★</span>
                </div>
                <div className="bg-surface-2 p-2 rounded-lg border border-border">
                  <span className="text-subtle block">Budget Fit</span>
                  <span className="font-bold text-text">4/5 ★</span>
                </div>
                <div className="bg-surface-2 p-2 rounded-lg border border-border">
                  <span className="text-subtle block">Delivery ETA</span>
                  <span className="font-bold text-text">22 mins</span>
                </div>
                <div className="bg-surface-2 p-2 rounded-lg border border-border">
                  <span className="text-subtle block">Taste Score</span>
                  <span className="font-bold text-brand">4.8 ★</span>
                </div>
              </div>

              {/* Explainability Callout */}
              <div className="mt-4 p-3 rounded-lg bg-nutri/8 border border-nutri/20 text-xs text-muted flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-nutri shrink-0 mt-0.5" />
                <p>
                  <strong className="text-text">Why This Meal:</strong> Matches your muscle gain profile (+42g protein), contains zero peanuts/allergens, and stays under your ₹350 budget ceiling.
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="checkout"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Cart Breakdown */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-nutri" />
                  <span className="text-xs font-bold text-text">Swiggy Staging Cart</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-nutri/15 text-nutri border border-nutri/30">
                  Safety Cap Verified
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-muted">
                  <span>1x High-Protein Grilled Chicken Bowl</span>
                  <span className="font-bold text-text">₹320</span>
                </div>
                <div className="flex justify-between text-nutri font-medium">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Coupon (HEALTHY50)
                  </span>
                  <span>-₹100</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Delivery &amp; Packaging Fee</span>
                  <span className="font-bold text-text">₹35</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-sm font-black text-text">
                  <span>Total Amount</span>
                  <span className="text-nutri">₹255</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-[11px] text-subtle flex items-center justify-between">
                <span>🛡️ Safety Checks: Below ₹1000 Cap</span>
                <span className="text-nutri font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Passed
                </span>
              </div>
            </div>

            {/* Live Driver Tracking Stepper */}
            <div className="rounded-xl border border-nutri/30 bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-text">Live Driver Dispatch Simulator</span>
                <span className="font-mono text-nutri font-bold">ETA: 22 Mins</span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  { label: "Placed", done: true },
                  { label: "Accepted", done: true },
                  { label: "Preparing", done: true, current: true },
                  { label: "Arriving", done: false },
                ].map((step) => (
                  <div
                    key={step.label}
                    className={`p-2 rounded-lg border text-[10px] font-bold uppercase transition-all ${
                      step.done
                        ? "bg-nutri/15 border-nutri/40 text-nutri"
                        : "bg-surface-2 border-border text-subtle"
                    } ${step.current ? "ring-2 ring-nutri/30" : ""}`}
                  >
                    {step.label}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
