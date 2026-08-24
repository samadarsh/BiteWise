'use client';

import React, { useState } from "react";
import { useAuth } from "../lib/auth-context";

type DemoContext =
  | "just_seeded"
  | "search_ready"
  | "recommendation_selected"
  | "order_placed"
  | "household_empty"
  | "household_populated";

interface DemoStoryBannerProps {
  context: DemoContext;
}

// Mode-independent guidance — applies equally whether the account is
// connected to the mock or a real Swiggy session.
const SHARED_MESSAGES: Partial<Record<DemoContext, { icon: string; message: string }>> = {
  search_ready: {
    icon: "🔍",
    message: "Enter a meal query and hit search. The AI ranks options by your nutrition targets, budget, and preferences.",
  },
  recommendation_selected: {
    icon: "🛒",
    message: "Review the nutrition breakdown, then add to cart. You can apply coupons before confirming.",
  },
  order_placed: {
    icon: "✅",
    message: "Meal logged to your nutrition ledger. Switch to SmartPantry AI to see pantry alerts and recipe intelligence.",
  },
  household_populated: {
    icon: "🏡",
    message: "SmartPantry AI is ready. Check low-stock alerts, explore recipe suggestions, then preview the grouped grocery cart.",
  },
};

// These two reference "demo data" and a "Load Demo Data" button that only
// exist in mock mode (the button is hidden entirely in live mode) — a real
// account never had demo data loaded and has no such button, so the copy
// must differ per mode instead of claiming something that isn't true.
const MOCK_ONLY_MESSAGES: Partial<Record<DemoContext, { icon: string; message: string }>> = {
  just_seeded: {
    icon: "🎯",
    message: "Demo data loaded. Start by searching for a meal — try \"high protein lunch\" or \"low calorie dinner\".",
  },
  household_empty: {
    icon: "📦",
    message: "Click \"Load Demo Data\" above to populate your pantry with realistic stock levels, family members, and grocery items.",
  },
};

const LIVE_MESSAGES: Partial<Record<DemoContext, { icon: string; message: string }>> = {
  just_seeded: {
    icon: "🎯",
    message: "Start by searching for a meal — try \"high protein lunch\" or \"low calorie dinner\".",
  },
  household_empty: {
    icon: "📦",
    message: "Your pantry is empty — add what you already have at home to get recipe matches and low-stock alerts.",
  },
};

export default function DemoStoryBanner({ context }: DemoStoryBannerProps) {
  const { user } = useAuth();
  const isLive = user?.mcp_mode === "live";
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const config = SHARED_MESSAGES[context] || (isLive ? LIVE_MESSAGES[context] : MOCK_ONLY_MESSAGES[context])!;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border-l-4 border-nutri bg-nutri/8 px-4 py-2.5 text-xs font-semibold text-text">
      <div className="flex items-center gap-2.5">
        <span className="text-base">{config.icon}</span>
        <span>{config.message}</span>
      </div>
      <button onClick={() => setDismissed(true)} className="shrink-0 text-subtle hover:text-text transition text-sm font-bold" aria-label="Dismiss banner">
        ✕
      </button>
    </div>
  );
}
