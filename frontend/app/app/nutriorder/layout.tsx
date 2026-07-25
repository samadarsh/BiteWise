"use client";

import React from "react";
import { NutriOrderProvider, useNutriOrder } from "../../../lib/nutriorder-context";
import OnboardingPanel from "../../../components/OnboardingPanel";
import FeedbackModal from "../../../components/FeedbackModal";

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
    trackingStep,
    handleReset,
    showFeedbackModal,
    setShowFeedbackModal,
    feedbackLoading,
    handleFeedbackSubmit,
  } = useNutriOrder();

  if (profileFetching) {
    return (
      <main className="max-w-xl w-full mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
        <Spinner className="h-10 w-10 text-nutri mb-3" />
        <p className="text-sm font-semibold text-muted">Loading your profile &amp; nutrition targets…</p>
      </main>
    );
  }

  if (!profile || !profile.weight_kg || !profile.height_cm || !profile.age || editingProfile) {
    return (
      <main className="max-w-xl w-full mx-auto px-4 py-6 flex items-center justify-center">
        <OnboardingPanel
          profile={
            profile || {
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
            }
          }
          onSave={handleOnboardingSave}
          loading={authLoading}
        />
      </main>
    );
  }

  if (placedOrderId) {
    return (
      <main className="max-w-4xl w-full mx-auto">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-8 shadow-lg flex flex-col gap-5 sm:gap-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-border pb-4 sm:pb-6">
            <div>
              <span className="text-[10px] sm:text-xs bg-nutri/10 text-nutri border border-nutri/20 font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full uppercase tracking-wider">Order In Progress</span>
              <h2 className="text-lg sm:text-2xl font-bold mt-2 text-text">Tracking {placedOrderId}</h2>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] sm:text-xs text-muted">Estimated Delivery Time</p>
              <p className="text-xl sm:text-2xl font-bold text-nutri">{selectedMeal?.eta || "25 mins"}</p>
            </div>
          </div>

          <div className="relative w-full my-2 sm:my-4 px-1 sm:px-8 overflow-visible">
            <div className="absolute left-[12.5%] right-[12.5%] top-4 sm:top-5 h-1 bg-border rounded-full" />
            <div className="absolute left-[12.5%] top-4 sm:top-5 h-1 bg-nutri rounded-full transition-all duration-1000" style={{ width: `${Math.min(75, Math.max(0, (trackingStep / 3) * 75))}%` }} />
            <div className="relative z-10 grid grid-cols-4 gap-0">
              {[
                { label: "Placed", desc: "Order sent to Swiggy" },
                { label: "Accepted", desc: "Restaurant confirmed" },
                { label: "Preparing", desc: "Meal being cooked" },
                { label: "Arriving", desc: "Out for delivery" },
              ].map((step, idx) => {
                const active = trackingStep >= idx;
                const isCurrent = trackingStep === idx && trackingStep < 3;
                return (
                  <div key={idx} className="flex min-w-0 flex-col items-center text-center">
                    <div className={`relative z-10 h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs border-2 transition-all duration-500 ${active ? "bg-nutri border-nutri text-nutri-contrast shadow-md" : "bg-surface-2 border-border-strong text-subtle"} ${isCurrent ? "ring-2 ring-nutri/30 ring-offset-2 ring-offset-surface" : ""}`}>
                      {active && trackingStep > idx ? (
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      ) : isCurrent ? (
                        <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 bg-nutri-contrast rounded-full animate-pulse" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <p className={`max-w-full truncate text-[10px] sm:text-xs font-semibold mt-2 sm:mt-3 ${active ? "text-text" : "text-subtle"}`}>{step.label}</p>
                    <p className="text-[8px] sm:text-[10px] text-subtle max-w-[70px] sm:max-w-[100px] mt-0.5 leading-tight hidden sm:block">{step.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-surface-2 border border-border rounded-xl p-4 sm:p-5 flex flex-col gap-3 sm:gap-4 mt-2 sm:mt-4">
            <h3 className="text-xs sm:text-sm font-bold text-text">Order Summary</h3>
            <div className="flex justify-between items-center text-sm border-b border-border pb-3">
              <div>
                <p className="font-semibold text-text text-xs sm:text-sm">{selectedMeal?.name}</p>
                <p className="text-[10px] sm:text-xs text-subtle">{selectedMeal?.restaurant}</p>
              </div>
              <p className="font-bold text-nutri text-sm sm:text-base">Rs {selectedMeal?.price}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
              <div className="bg-surface border border-border rounded-lg p-2 sm:p-2.5">
                <p className="text-[8px] sm:text-[10px] text-subtle uppercase font-bold tracking-wider">Macros Met</p>
                <p className="text-xs sm:text-sm font-bold text-text mt-0.5 sm:mt-1">100%</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-2 sm:p-2.5">
                <p className="text-[8px] sm:text-[10px] text-subtle uppercase font-bold tracking-wider">Protein Total</p>
                <p className="text-xs sm:text-sm font-bold text-nutri mt-0.5 sm:mt-1">{selectedMeal?.protein}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-2 sm:p-2.5">
                <p className="text-[8px] sm:text-[10px] text-subtle uppercase font-bold tracking-wider">Calories</p>
                <p className="text-xs sm:text-sm font-bold text-info mt-0.5 sm:mt-1">{selectedMeal?.calories}</p>
              </div>
            </div>
          </div>

          <button onClick={handleReset} className="mt-2 sm:mt-6 self-center bg-surface-2 hover:bg-surface-3 border border-border text-text font-semibold px-5 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm transition-all">Order Something Else</button>
        </div>

        {showFeedbackModal && (
          <FeedbackModal onSubmit={handleFeedbackSubmit} onClose={() => setShowFeedbackModal(false)} loading={feedbackLoading} />
        )}
      </main>
    );
  }

  return <>{children}</>;
}

export default function NutriOrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <NutriOrderProvider>
      <NutriOrderGate>{children}</NutriOrderGate>
    </NutriOrderProvider>
  );
}
