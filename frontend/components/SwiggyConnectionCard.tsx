"use client";

import React from "react";
import { useAuth } from "../lib/auth-context";

export function SwiggyConnectionCard() {
  const { user, isAuthenticated, isSwiggyConnected, connectSwiggy, openAuthModal } = useAuth();

  return (
    <div className="relative overflow-hidden bg-surface border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left info */}
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 border ${
              isSwiggyConnected ? "bg-nutri/10 border-nutri/30 text-nutri" : "bg-brand/10 border-brand/30 text-brand"
            }`}
          >
            🛵
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-text">Swiggy Integration</h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                  isSwiggyConnected ? "bg-nutri/15 text-nutri border-nutri/40" : "bg-brand/15 text-brand border-brand/40"
                }`}
              >
                {isSwiggyConnected ? "Account Linked" : "Action Required"}
              </span>
            </div>

            <p className="text-xs text-muted max-w-xl">
              {isSwiggyConnected
                ? `Your Swiggy account is connected to BiteWise (${user?.name || user?.email || user?.id}). You can place 1-click orders for AI healthy meal recommendations.`
                : "Connect your Swiggy account to authorize BiteWise AI to search restaurants, check live cart availability, and execute orders."}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="shrink-0 w-full md:w-auto">
          {!isAuthenticated ? (
            <button
              onClick={openAuthModal}
              className="w-full md:w-auto bg-brand hover:brightness-105 text-brand-contrast font-bold text-xs py-2.5 px-5 rounded-xl transition shadow-md"
            >
              Sign In First to Connect Swiggy
            </button>
          ) : isSwiggyConnected ? (
            <button
              onClick={connectSwiggy}
              className="w-full md:w-auto bg-surface-2 hover:bg-surface-3 text-muted font-semibold text-xs py-2.5 px-4 rounded-xl border border-border transition"
            >
              Re-authorize Swiggy
            </button>
          ) : (
            <button
              onClick={connectSwiggy}
              className="w-full md:w-auto bg-brand hover:brightness-105 text-brand-contrast font-bold text-xs py-2.5 px-5 rounded-xl transition shadow-md flex items-center justify-center gap-2"
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
