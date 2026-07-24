'use client';

import React from "react";
import HouseholdDashboard from "../household/HouseholdDashboard";
import DemoStoryBanner from "../DemoStoryBanner";
import { useDashboard } from "../../lib/dashboard-context";

export default function SmartPantryView() {
  const { dataVersion } = useDashboard();

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Product hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-amber-500/15 border border-amber-500/30 text-amber-300">SmartPantry AI</span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">🏡 Shared Household Intelligence</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            Pantry, Recipe &amp; <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-amber-200 bg-clip-text text-transparent">Grocery Intelligence</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
            Track household ingredient inventory, auto-match recipes to available stock, detect dietary conflicts, and build grouped grocery lists.
          </p>
        </div>
      </div>

      <DemoStoryBanner context="household_populated" />

      {/* Remounting on dataVersion forces a fresh load after demo seed/reset. */}
      <HouseholdDashboard key={dataVersion} />
    </div>
  );
}
