"use client";

import React, { useState } from "react";
import { useAuth } from "../lib/auth-context";

interface UserMenuHeaderProps {
  onEditProfile?: () => void;
}

export function UserMenuHeader({ onEditProfile }: UserMenuHeaderProps) {
  const { user, isAuthenticated, isSwiggyConnected, openAuthModal, connectSwiggy, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {isAuthenticated && onEditProfile && (
        <button
          onClick={onEditProfile}
          className="hidden sm:flex text-xs text-nutri hover:brightness-110 font-semibold px-2.5 py-1.5 rounded-lg bg-nutri/10 hover:bg-nutri/20 border border-nutri/30 transition items-center gap-1.5"
          title="Edit personal biometrics (height, weight, age, goals)"
        >
          <span>✏️</span>
          <span>Edit Profile</span>
        </button>
      )}

      {isAuthenticated && (
        <button
          onClick={connectSwiggy}
          className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
            isSwiggyConnected
              ? "bg-nutri/10 border-nutri/40 text-nutri hover:bg-nutri/20"
              : "bg-brand/10 border-brand/40 text-brand hover:bg-brand/20"
          }`}
          title={isSwiggyConnected ? "Swiggy Account Linked" : "Click to connect your Swiggy Account"}
        >
          <span className="w-2 h-2 rounded-full bg-current" />
          <span>{isSwiggyConnected ? "Swiggy Connected" : "Connect Swiggy"}</span>
        </button>
      )}

      {!isAuthenticated ? (
        <button
          onClick={openAuthModal}
          className="flex items-center gap-2 bg-brand hover:brightness-105 text-brand-contrast font-bold text-xs py-2 px-4 rounded-xl shadow-md transition"
        >
          <span>Sign In / Register</span>
        </button>
      ) : (
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 bg-surface-2 hover:bg-surface-3 border border-border rounded-xl px-3 py-1.5 text-xs text-text transition"
          >
            <div className="w-6 h-6 rounded-full bg-brand text-brand-contrast font-bold flex items-center justify-center text-xs">
              {user?.name ? user.name[0].toUpperCase() : "U"}
            </div>
            <span className="font-medium max-w-[120px] truncate">{user?.name || user?.email || "Guest User"}</span>
            <span className="text-subtle text-[10px]">▼</span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-xl shadow-xl py-2 z-50 text-xs text-muted">
              <div className="px-4 py-2 border-b border-border">
                <p className="font-semibold text-text truncate">{user?.name || "BiteWise App User"}</p>
                <p className="text-[11px] text-subtle truncate">{user?.email || `ID: ${user?.id}`}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded bg-surface-2 text-[10px] text-muted uppercase tracking-wider font-semibold">
                  Provider: {user?.auth_provider}
                </span>
              </div>

              {onEditProfile && (
                <button
                  onClick={() => { setDropdownOpen(false); onEditProfile(); }}
                  className="w-full text-left px-4 py-2 hover:bg-surface-2 text-nutri flex items-center gap-2 transition border-b border-border"
                >
                  <span>⚙️ Edit Profile &amp; Biometrics</span>
                </button>
              )}

              <button
                onClick={() => { setDropdownOpen(false); connectSwiggy(); }}
                className="w-full text-left px-4 py-2 hover:bg-surface-2 flex items-center justify-between transition text-text"
              >
                <span>Swiggy Account</span>
                <span className={isSwiggyConnected ? "text-nutri" : "text-brand"}>{isSwiggyConnected ? "Linked ✓" : "Not Linked"}</span>
              </button>

              <button
                onClick={() => { setDropdownOpen(false); logout(); }}
                className="w-full text-left px-4 py-2 hover:bg-danger/10 text-danger transition border-t border-border"
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
