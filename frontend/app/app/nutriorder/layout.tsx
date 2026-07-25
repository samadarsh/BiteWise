"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NutriOrderProvider, useNutriOrder } from "../../../lib/nutriorder-context";
import { useDashboard } from "../../../lib/dashboard-context";
import OnboardingPanel from "../../../components/OnboardingPanel";
import OnboardingWizard from "../../../components/onboarding/OnboardingWizard";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function NutriOrderGate({ children }: { children: React.ReactNode }) {
  const {
    profileFetching,
    profile,
    editingProfile,
    proteinTarget,
    calorieTarget,
    dietPreference,
    allergies,
    dislikes,
    favCuisines,
    fitnessGoal,
    authLoading,
    handleOnboardingSave,
    placedOrderId,
    selectedMeal,
    priorityWeights,
    setPriorityWeights,
  } = useNutriOrder();
  const pathname = usePathname();
  const { setOnboardingBlocking } = useDashboard();

  const profileIncomplete = !profile || !profile.weight_kg || !profile.height_cm || !profile.age;

  // The sidebar renders one level up from this gate and has no idea whether
  // we're showing the wizard or the real page — without this it lets you
  // click into Coach/Order/History/Preferences mid-onboarding, the URL
  // changes and the sidebar highlights it, but this gate still renders the
  // wizard regardless of route, so nothing visible actually happens.
  useEffect(() => {
    setOnboardingBlocking(!profileFetching && profileIncomplete);
    return () => setOnboardingBlocking(false);
  }, [profileFetching, profileIncomplete, setOnboardingBlocking]);

  if (profileFetching) {
    return (
      <main className="max-w-xl w-full mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
        <Spinner className="h-10 w-10 text-nutri mb-3" />
        <p className="text-sm font-semibold text-muted">Loading your profile &amp; nutrition targets…</p>
      </main>
    );
  }
  const fallbackProfile = {
    protein_target: proteinTarget,
    calorie_target: calorieTarget,
    diet_preference: dietPreference,
    allergies,
    dislikes,
    favorite_cuisines: favCuisines,
    fitness_goal: fitnessGoal,
    activity_level: "moderate",
    meal_budget_default: 300,
    preferred_meal_times: {},
    spice_tolerance: "medium",
  };

  // Genuinely first-time setup gets the guided multi-step wizard. A returning
  // user clicking "Edit Profile" just wants a quick tweak, not a 5-step replay
  // — they get the plain single-form editor instead.
  if (profileIncomplete) {
    return (
      <main className="max-w-xl w-full mx-auto px-4 py-6 flex items-center justify-center">
        <OnboardingWizard
          profile={profile || fallbackProfile}
          onSave={handleOnboardingSave}
          loading={authLoading}
          priorityWeights={priorityWeights}
          onPriorityWeightsChange={setPriorityWeights}
        />
      </main>
    );
  }

  if (editingProfile) {
    return (
      <main className="max-w-xl w-full mx-auto px-4 py-6 flex items-center justify-center">
        <OnboardingPanel profile={profile || fallbackProfile} onSave={handleOnboardingSave} loading={authLoading} />
      </main>
    );
  }

  // The full tracking view lives on the Order page itself (where checkout
  // happened) — Coach/Orders/Preferences stay fully usable while an order is
  // in flight, just with a light reminder pointing back to it.
  const onOrderPage = pathname === "/app/nutriorder/order";

  return (
    <>
      {placedOrderId && !onOrderPage && (
        <Link
          href="/app/nutriorder/order"
          className="flex items-center justify-between gap-3 rounded-xl border border-nutri/20 bg-nutri/10 px-4 py-2.5 text-xs font-semibold text-text hover:border-nutri/40 transition"
        >
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-nutri animate-pulse shrink-0" />
            Order in progress{selectedMeal ? ` — ${selectedMeal.name}` : ""} · ETA {selectedMeal?.eta || "25 mins"}
          </span>
          <span className="text-nutri shrink-0">View tracking →</span>
        </Link>
      )}
      {children}
    </>
  );
}

export default function NutriOrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <NutriOrderProvider>
      <NutriOrderGate>{children}</NutriOrderGate>
    </NutriOrderProvider>
  );
}
