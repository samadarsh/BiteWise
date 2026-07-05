'use client';

import React, { useState } from "react";

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

const BANNER_MESSAGES: Record<DemoContext, { icon: string; message: string; accent: string }> = {
  just_seeded: {
    icon: "🎯",
    message: "Demo data loaded. Start by searching for a meal — try \"high protein lunch\" or \"low calorie dinner\".",
    accent: "border-indigo-500/40 bg-indigo-500/8 text-indigo-300",
  },
  search_ready: {
    icon: "🔍",
    message: "Enter a meal query and hit Search. The AI will rank options by your nutrition targets, budget, and preferences.",
    accent: "border-emerald-500/40 bg-emerald-500/8 text-emerald-300",
  },
  recommendation_selected: {
    icon: "🛒",
    message: "Review the nutrition breakdown, then add to cart if it looks good. You can apply coupons before confirming.",
    accent: "border-amber-500/40 bg-amber-500/8 text-amber-300",
  },
  order_placed: {
    icon: "✅",
    message: "Meal logged to your nutrition ledger. Switch to Household & Pantry tab to see pantry alerts and recipe intelligence.",
    accent: "border-emerald-500/40 bg-emerald-500/8 text-emerald-300",
  },
  household_empty: {
    icon: "📦",
    message: "Click \"Seed Demo Data\" above to populate your pantry with realistic stock levels, family members, and grocery items.",
    accent: "border-indigo-500/40 bg-indigo-500/8 text-indigo-300",
  },
  household_populated: {
    icon: "🏡",
    message: "Check low-stock alerts at the top, explore recipe suggestions, then preview the grouped grocery cart.",
    accent: "border-emerald-500/40 bg-emerald-500/8 text-emerald-300",
  },
};

export default function DemoStoryBanner({ context }: DemoStoryBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const config = BANNER_MESSAGES[context];

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border-l-4 px-4 py-2.5 text-xs font-semibold ${config.accent} transition-all`}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-base">{config.icon}</span>
        <span>{config.message}</span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-white/30 hover:text-white/60 transition text-sm font-bold"
        aria-label="Dismiss banner"
      >
        ✕
      </button>
    </div>
  );
}
