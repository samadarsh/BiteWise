"use client";

import React, { useState } from "react";
import { useAuth } from "../lib/auth-context";

export function UserMenuHeader() {
  const { user, isAuthenticated, isSwiggyConnected, openAuthModal, connectSwiggy, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="flex items-center gap-3">
      {/* Swiggy Account Linkage Status Button */}
      {isAuthenticated && (
        <button
          onClick={connectSwiggy}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
            isSwiggyConnected
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20"
              : "bg-orange-500/10 border-orange-500/40 text-orange-400 hover:bg-orange-500/20 animate-pulse"
          }`}
          title={isSwiggyConnected ? "Swiggy Account Linked" : "Click to connect your Swiggy Account"}
        >
          <span className="w-2 h-2 rounded-full bg-current" />
          <span>{isSwiggyConnected ? "Swiggy Connected" : "Connect Swiggy"}</span>
        </button>
      )}

      {/* User Identity / Login trigger */}
      {!isAuthenticated ? (
        <button
          onClick={openAuthModal}
          className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-bold text-xs py-2 px-4 rounded-xl shadow-lg shadow-orange-500/20 transition"
        >
          <span>Sign In / Register</span>
        </button>
      ) : (
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 rounded-xl px-3 py-1.5 text-xs text-zinc-200 transition"
          >
            <div className="w-6 h-6 rounded-full bg-orange-500 text-black font-bold flex items-center justify-center text-xs">
              {user?.name ? user.name[0].toUpperCase() : "U"}
            </div>
            <span className="font-medium max-w-[120px] truncate">
              {user?.name || user?.email || "Guest User"}
            </span>
            <span className="text-zinc-500 text-[10px]">▼</span>
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl py-2 z-50 text-xs text-zinc-300">
              <div className="px-4 py-2 border-b border-zinc-800">
                <p className="font-semibold text-white truncate">{user?.name || "BiteWise App User"}</p>
                <p className="text-[11px] text-zinc-500 truncate">{user?.email || `ID: ${user?.id}`}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                  Provider: {user?.auth_provider}
                </span>
              </div>

              <button
                onClick={() => {
                  setDropdownOpen(false);
                  connectSwiggy();
                }}
                className="w-full text-left px-4 py-2 hover:bg-zinc-800 flex items-center justify-between transition"
              >
                <span>Swiggy Account</span>
                <span className={isSwiggyConnected ? "text-emerald-400" : "text-orange-400"}>
                  {isSwiggyConnected ? "Linked ✓" : "Not Linked"}
                </span>
              </button>

              <button
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                }}
                className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 transition border-t border-zinc-800"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
