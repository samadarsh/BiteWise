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

const BANNER_MESSAGES: Record<DemoContext, { icon: string; message: string }> = {
  just_seeded: {
    icon: "🎯",
    message: "Demo data loaded. Start by searching for a meal — try \"high protein lunch\" or \"low calorie dinner\".",
  },
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
  household_empty: {
    icon: "📦",
    message: "Click \"Load Demo Data\" above to populate your pantry with realistic stock levels, family members, and grocery items.",
  },
  household_populated: {
    icon: "🏡",
    message: "SmartPantry AI is ready. Check low-stock alerts, explore recipe suggestions, then preview the grouped grocery cart.",
  },
};

export default function DemoStoryBanner({ context }: DemoStoryBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const config = BANNER_MESSAGES[context];

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
