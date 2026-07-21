"use client";

import React, { useState } from "react";
import { useAuth } from "../lib/auth-context";

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, loginWithGoogle, loginAsGuest, isLoading } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    // In dev mode / mock mode, trigger Google Sign-in flow
    const success = await loginWithGoogle("mock_google_token_123", "demo.user@gmail.com", "Demo User");
    if (!success) {
      setErrorMsg("Failed to authenticate with Google. Please try again.");
    }
  };

  const handleGuestSignIn = async () => {
    setErrorMsg(null);
    const success = await loginAsGuest();
    if (!success) {
      setErrorMsg("Failed to create guest session.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 text-zinc-100 overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white text-xl font-bold p-1 transition"
          aria-label="Close modal"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-xl font-black text-black shadow-lg shadow-orange-500/30">
            B
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Sign in to BiteWise</h2>
            <p className="text-xs text-zinc-400">Your AI-Powered Nutrition & Order Intelligence Platform</p>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 mb-6">
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-white text-zinc-900 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-100 transition shadow-md disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isLoading ? "Signing in..." : "Sign in with Google"}</span>
          </button>

          <button
            onClick={handleGuestSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-3 px-4 rounded-xl border border-zinc-700/60 transition disabled:opacity-50 text-sm"
          >
            <span>👤 Continue as Guest</span>
          </button>
        </div>

        {/* Platform Features Summary */}
        <div className="border-t border-zinc-800 pt-4 space-y-2 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">✓</span>
            <span>Personal AI macro targets & dietary preference memory</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">✓</span>
            <span>SmartPantry AI & household ingredient tracking</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-orange-400">✓</span>
            <span>Link Swiggy Account for 1-click healthy food ordering</span>
          </div>
        </div>
      </div>
    </div>
  );
}
