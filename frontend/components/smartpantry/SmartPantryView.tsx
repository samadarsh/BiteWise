'use client';

import React from "react";
import HouseholdDashboard from "../household/HouseholdDashboard";

export default function SmartPantryView() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 text-slate-100 animate-fade-in pb-16">
      
      {/* Hero Product Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-teal-500/15 border border-teal-500/30 text-teal-300">
                SmartPantry AI
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                🏡 Shared Household Intelligence
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Pantry, Recipe & <span className="bg-gradient-to-r from-teal-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent">Grocery Intelligence</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
              Track household ingredient inventory, auto-match recipes to available stock, detect dietary conflicts, and build grouped grocery lists.
            </p>
          </div>
        </div>
      </div>

      {/* Main Household & Pantry Intelligence View */}
      <HouseholdDashboard />
    </div>
  );
}
