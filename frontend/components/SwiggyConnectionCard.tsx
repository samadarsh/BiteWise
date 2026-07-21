"use client";

import React from "react";
import { useAuth } from "../lib/auth-context";

export function SwiggyConnectionCard() {
  const { user, isAuthenticated, isSwiggyConnected, connectSwiggy, openAuthModal } = useAuth();

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-800/80 border border-zinc-800/80 rounded-2xl p-5 shadow-lg">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left info */}
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 ${
            isSwiggyConnected 
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" 
              : "bg-orange-500/10 border border-orange-500/30 text-orange-400"
          }`}>
            🛵
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-white">Swiggy Integration</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                isSwiggyConnected
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "bg-orange-500/20 text-orange-400 border border-orange-500/40"
              }`}>
                {isSwiggyConnected ? "Account Linked" : "Action Required"}
              </span>
            </div>

            <p className="text-xs text-zinc-400 max-w-xl">
              {isSwiggyConnected
                ? `Your Swiggy account is connected to BiteWise user profile (${user?.name || user?.email || user?.id}). You can place 1-click orders for AI healthy meal recommendations.`
                : "Connect your Swiggy account to authorize BiteWise AI to search restaurants, check live cart availability, and execute orders."}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="shrink-0 w-full md:w-auto">
          {!isAuthenticated ? (
            <button
              onClick={openAuthModal}
              className="w-full md:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-bold text-xs py-2.5 px-5 rounded-xl transition shadow-md"
            >
              Sign In First to Connect Swiggy
            </button>
          ) : isSwiggyConnected ? (
            <button
              onClick={connectSwiggy}
              className="w-full md:w-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs py-2.5 px-4 rounded-xl border border-zinc-700 transition"
            >
              Re-authorize Swiggy
            </button>
          ) : (
            <button
              onClick={connectSwiggy}
              className="w-full md:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-bold text-xs py-2.5 px-5 rounded-xl transition shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
            >
              <span>Connect Swiggy Account</span>
              <span>→</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
