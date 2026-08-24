"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Clock, Tag, Sparkles, CheckCircle2, Star, Flame, Dumbbell } from "lucide-react";

export function NutriOrderShowcase() {
  const [activeTab, setActiveTab] = useState<"ranking" | "checkout">("ranking");

  return (
    <div className="rounded-2xl border border-nutri/30 bg-[#0c1017] p-5 sm:p-7 shadow-2xl relative overflow-hidden text-white">
      {/* Glow effect */}
      <div className="absolute -top-16 -right-16 w-56 h-56 bg-nutri/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-[#f4b544]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Controls */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 rounded-full bg-nutri animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider text-nutri">Live Swiggy MCP Staging</span>
        </div>
        <div className="flex items-center gap-1 bg-[#111826] border border-white/10 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab("ranking")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "ranking"
                ? "bg-nutri text-nutri-contrast shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            AI Ranked Gourmet Meal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("checkout")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "checkout"
                ? "bg-nutri text-nutri-contrast shadow-sm"
                : "text-white/60 hover:text-white"
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
            {/* Top Match Card with Food Photography */}
            <div className="rounded-xl border border-[#f4b544]/40 bg-[#111826] p-4 sm:p-5 shadow-2xl relative overflow-hidden group">
              {/* Food Image Banner */}
              <div className="relative h-48 sm:h-56 w-full rounded-lg overflow-hidden mb-4 border border-white/10">
                <Image
                  src="/images/nutri_hero_bowl.png"
                  alt="High-Protein Teriyaki Chicken Bowl"
                  fill
                  sizes="(max-width: 768px) 100vw, 500px"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111826] via-[#111826]/30 to-transparent" />

                {/* Floating Glassmorphic Badges on Image */}
                <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-nutri text-nutri-contrast shadow-lg">
                    94% Health Match
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#111826]/90 border border-white/20 text-white backdrop-blur-md flex items-center gap-1">
                    <Clock className="h-3 w-3 text-nutri" /> 22 Mins
                  </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                      <Dumbbell className="h-3 w-3" /> +42g Protein
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                      <Flame className="h-3 w-3" /> 580 kcal
                    </span>
                  </div>
                  <span className="text-xl font-black text-[#f4b544] drop-shadow">₹320</span>
                </div>
              </div>

              {/* Meal Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div>
                  <h4 className="text-base sm:text-lg font-black text-white">Grilled Teriyaki Chicken &amp; Avocado Bowl</h4>
                  <p className="text-xs text-white/50">Bikganai Biryani &amp; Bowls &middot; Japanese &amp; Healthy Asian</p>
                </div>
              </div>

              {/* Factor Ratings */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px] my-3">
                <div className="bg-[#0c1017] p-2 rounded-lg border border-white/10">
                  <span className="text-white/50 block">Nutrition Fit</span>
                  <span className="font-bold text-nutri">5/5 ★</span>
                </div>
                <div className="bg-[#0c1017] p-2 rounded-lg border border-white/10">
                  <span className="text-white/50 block">Budget Score</span>
                  <span className="font-bold text-white">4/5 ★</span>
                </div>
                <div className="bg-[#0c1017] p-2 rounded-lg border border-white/10">
                  <span className="text-white/50 block">Delivery Time</span>
                  <span className="font-bold text-white">22 mins</span>
                </div>
                <div className="bg-[#0c1017] p-2 rounded-lg border border-white/10">
                  <span className="text-white/50 block">User Rating</span>
                  <span className="font-bold text-[#f4b544] flex items-center justify-center gap-0.5">
                    <Star className="h-3 w-3 fill-[#f4b544]" /> 4.8
                  </span>
                </div>
              </div>

              {/* Explainability Callout */}
              <div className="p-3 rounded-lg bg-nutri/10 border border-nutri/25 text-xs text-white/80 flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-nutri shrink-0 mt-0.5" />
                <p>
                  <strong className="text-white">Why This Meal:</strong> Precisely satisfies your muscle gain target (+42g protein), zero peanut allergens, and stays well below your ₹350 budget limit.
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
            <div className="rounded-xl border border-white/10 bg-[#111826] p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-nutri" />
                  <span className="text-xs font-bold text-white">Swiggy Staging Cart</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-nutri/20 text-nutri border border-nutri/30">
                  Safety Cap Verified
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-white/70">
                  <span>1x Grilled Teriyaki Chicken Bowl</span>
                  <span className="font-bold text-white">₹320</span>
                </div>
                <div className="flex justify-between text-nutri font-medium">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Swiggy Coupon (HEALTHY50)
                  </span>
                  <span>-₹100</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Delivery &amp; Packaging Fee</span>
                  <span className="font-bold text-white">₹35</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2 text-sm font-black text-white">
                  <span>Total Amount</span>
                  <span className="text-nutri">₹255</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#0c1017] border border-white/10 text-[11px] text-white/60 flex items-center justify-between">
                <span>🛡️ Safety Checks: Below ₹1000 Cap</span>
                <span className="text-nutri font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Passed
                </span>
              </div>
            </div>

            {/* Live Driver Tracking Stepper */}
            <div className="rounded-xl border border-nutri/30 bg-[#111826] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">Live Driver Dispatch Simulator</span>
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
                        ? "bg-nutri/20 border-nutri/50 text-nutri"
                        : "bg-[#0c1017] border-white/10 text-white/40"
                    } ${step.current ? "ring-2 ring-nutri/40" : ""}`}
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
