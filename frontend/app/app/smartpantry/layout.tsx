"use client";

import React, { useEffect, useState } from "react";
import { SmartPantryProvider, useSmartPantry } from "../../../lib/smartpantry-context";
import { useDashboard } from "../../../lib/dashboard-context";
import SmartPantryOnboardingWizard from "../../../components/onboarding-smartpantry/SmartPantryOnboardingWizard";

function SmartPantryGate({ children }: { children: React.ReactNode }) {
  const { household, pantry, loading, error, handleQuickStock, handleAddGrocery, handleAddMember, handleDeleteMember } = useSmartPantry();
  const { setOnboardingBlocking } = useDashboard();

  // The onboarding decision is captured once, the first time loading finishes,
  // and never re-derived from live `pantry` state afterward — stocking the
  // pantry in the wizard's own first step updates that state immediately (for
  // an instant "here's what you can cook" payoff), which would otherwise make
  // the gate flip and unmount the wizard mid-flow.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && showOnboarding === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time onboarding decision, captured only once loading resolves
      setShowOnboarding(pantry.length === 0);
    }
  }, [loading, pantry.length, showOnboarding]);

  // The sidebar renders one level up from this gate and has no idea whether
  // we're showing the wizard or the real page — without this it lets you
  // click into Pantry/Grocery/Household mid-onboarding, the URL changes and
  // the sidebar highlights it, but this gate still renders the wizard
  // regardless of route, so nothing visible actually happens.
  useEffect(() => {
    setOnboardingBlocking(showOnboarding === true);
    return () => setOnboardingBlocking(false);
  }, [showOnboarding, setOnboardingBlocking]);

  if (loading || showOnboarding === null) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border-strong border-t-pantry"></div>
        <p className="text-sm font-semibold text-muted">Loading SmartPantry AI...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <div className="p-4 rounded-xl border border-danger/30 bg-danger/10 text-danger text-sm">⚠️ {error}</div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <SmartPantryOnboardingWizard
        members={household?.members || []}
        onQuickStock={handleQuickStock}
        onAddGrocery={handleAddGrocery}
        onAddMember={handleAddMember}
        onDeleteMember={handleDeleteMember}
        onComplete={() => setShowOnboarding(false)}
      />
    );
  }

  return <>{children}</>;
}

export default function SmartPantryLayout({ children }: { children: React.ReactNode }) {
  return (
    <SmartPantryProvider>
      <SmartPantryGate>{children}</SmartPantryGate>
    </SmartPantryProvider>
  );
}
