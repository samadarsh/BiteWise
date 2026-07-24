'use client';

import React, { useState, useEffect, useRef } from "react";
import { api, ApiError, UserProfile, Address, RecommendationMeal, CartInfo, Coupon } from "../../lib/api";
import OnboardingPanel from "../OnboardingPanel";
import PriorityControls, { PriorityWeights } from "../PriorityControls";
import RecommendationCard from "../RecommendationCard";
import RelaxationOptions, { RelaxationOption } from "../RelaxationOptions";
import FeedbackModal from "../FeedbackModal";
import CoachDashboard, { CoachDashboardRef } from "../CoachDashboard";
import DemoStoryBanner from "../DemoStoryBanner";
import LoadingSkeleton from "../LoadingSkeleton";
import { SwiggyConnectionCard } from "../SwiggyConnectionCard";
import { useAuth } from "../../lib/auth-context";
import { useDashboard } from "../../lib/dashboard-context";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export default function NutriOrderView() {
  const { user: authUser, isAuthenticated } = useAuth();
  const { dataVersion, showAlert, editProfileRequested, clearEditProfileRequest } = useDashboard();

  // Profile targets matching backend model
  const [fitnessGoal, setFitnessGoal] = useState<string>("maintenance");
  const [proteinTarget, setProteinTarget] = useState<number>(35);
  const [calorieTarget, setCalorieTarget] = useState<number>(650);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [favCuisines, setFavCuisines] = useState<string[]>([]);
  const [dietPreference, setDietPreference] = useState<string>("any");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState<boolean>(false);
  const [profileFetching, setProfileFetching] = useState<boolean>(true);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Addresses & session
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [sessionStatus, setSessionStatus] = useState<string>("START");

  // Recommendation & cart states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [recommendations, setRecommendations] = useState<RecommendationMeal[]>([]);
  const [selectedMeal, setSelectedMeal] = useState<RecommendationMeal | null>(null);
  const [cartPreview, setCartPreview] = useState<CartInfo | null>(null);
  const [cartLoading, setCartLoading] = useState<boolean>(false);
  const [checkoutConfirmed, setCheckoutConfirmed] = useState<boolean>(false);
  const [orderPlacing, setOrderPlacing] = useState<boolean>(false);
  const [placedOrderId, setPlacedOrderId] = useState<string>("");
  const [trackingStep, setTrackingStep] = useState<number>(0);
  const [trackingIntervalId, setTrackingIntervalId] = useState<ReturnType<typeof setInterval> | null>(null);
  const [applicableCoupons, setApplicableCoupons] = useState<Coupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState<boolean>(false);
  const [appliedCoupon, setAppliedCoupon] = useState<string>("");
  const [relaxationOptions, setRelaxationOptions] = useState<RelaxationOption[]>([]);
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
  const [feedbackLoading, setFeedbackLoading] = useState<boolean>(false);
  const [priorityWeights, setPriorityWeights] = useState<PriorityWeights>({
    protein_priority: 1.0,
    calorie_priority: 1.0,
    budget_priority: 1.0,
    speed_priority: 1.0,
    taste_priority: 1.0,
    clean_eating_priority: 1.0,
  });

  const coachDashboardRef = useRef<CoachDashboardRef>(null);

  const loadProfileFields = (prof: UserProfile) => {
    setProfile(prof);
    setFitnessGoal(prof.fitness_goal);
    setProteinTarget(prof.protein_target);
    setCalorieTarget(prof.calorie_target);
    setDietPreference(prof.diet_preference || "any");
    setAllergies(prof.allergies || []);
    setDislikes(prof.dislikes || []);
    setFavCuisines(prof.favorite_cuisines || []);
  };

  const refreshAddresses = async () => {
    try {
      const addrs = await api.getAddresses();
      setAddresses(addrs);
    } catch (err) {
      console.error("Failed to load addresses", err);
    }
  };

  const clearFlowState = () => {
    setRecommendations([]);
    setSelectedMeal(null);
    setCartPreview(null);
    setAppliedCoupon("");
    setApplicableCoupons([]);
    setCheckoutConfirmed(false);
  };

  // Load profile + addresses on mount, on auth change, and after demo seed/reset (dataVersion bump).
  useEffect(() => {
    let cancelled = false;
    async function loadUserData() {
      if (!isAuthenticated) {
        setProfile(null);
        setProfileFetching(false);
        return;
      }
      setProfileFetching(true);
      if (authUser?.profile) {
        loadProfileFields(authUser.profile as UserProfile);
      }
      try {
        const prof = await api.getProfile();
        if (cancelled) return;
        loadProfileFields(prof);
        await refreshAddresses();
      } catch {
        // Unauthenticated or profile missing
      } finally {
        if (!cancelled) setProfileFetching(false);
      }
      // After a seed/reset, wipe the in-progress order flow and refresh the coach ledger.
      clearFlowState();
      coachDashboardRef.current?.refreshCoachData();
    }
    loadUserData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authUser?.id, dataVersion]);

  // Honor an "edit profile" request coming from the shell header menu.
  useEffect(() => {
    if (editProfileRequested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- consuming a one-shot request signal from the shell context
      setEditingProfile(true);
      clearEditProfileRequest();
    }
  }, [editProfileRequested, clearEditProfileRequest]);

  const syncProfileChange = async (goal: string, protein: number, calories: number, allergyList: string[]) => {
    if (!isAuthenticated) return;
    try {
      await api.updateProfile({
        fitness_goal: goal,
        protein_target: protein,
        calorie_target: calories,
        diet_preference: dietPreference,
        allergies: allergyList,
        dislikes: dislikes,
        favorite_cuisines: favCuisines,
        age: profile?.age || null,
        gender: profile?.gender || null,
        height_cm: profile?.height_cm || null,
        weight_kg: profile?.weight_kg || null,
        activity_level: profile?.activity_level || "moderate",
        meal_budget_default: profile?.meal_budget_default || 300,
        preferred_meal_times: profile?.preferred_meal_times || {},
        spice_tolerance: profile?.spice_tolerance || "medium",
      });
    } catch (err) {
      console.error("Failed to save profile modifications", err);
    }
  };

  const handleAddressSelect = async (addrId: string) => {
    setSelectedAddress(addrId);
    try {
      const sess = await api.startOrderSession();
      const boundSess = await api.selectAddress(sess.session_id, addrId);
      setActiveSessionId(sess.session_id);
      setSessionStatus(boundSess.status);
      setRecommendations([]);
      setSelectedMeal(null);
      setCartPreview(null);
      setCheckoutConfirmed(false);
    } catch (err) {
      showAlert(`Failed to start session: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const mapCandidates = (rawCandidates: NonNullable<Awaited<ReturnType<typeof api.searchRecommendations>>["results"]["recommendations"]>) =>
    rawCandidates.map((c) => ({
      id: c.item_id,
      name: c.name || c.item_name || "Recommended meal",
      restaurant: c.restaurant_name || "Unknown Restaurant",
      price: c.price,
      eta: `${c.delivery_time_min || 30} mins`,
      protein: `${c.protein_g || 0}g`,
      calories: c.calories ? `${c.calories} kcal` : "N/A",
      score: c.match_score || 80,
      reasons: c.explanations || ["Fits nutritional criteria."],
      why_this_meal: c.why_this_meal || [],
      tradeoffs: c.tradeoffs || [],
      confidence: c.confidence || 1.0,
      is_estimated: c.is_estimated !== false,
      restaurant_id: c.restaurant_id,
      item_id: c.item_id,
      distance_km: c.distance_km as number | undefined,
    }));

  const handleQuerySearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeSessionId) {
      showAlert("Please select a delivery address to start an order session first!", "warning");
      return;
    }
    setSearchLoading(true);
    try {
      const res = await api.searchRecommendations(activeSessionId, searchQuery, priorityWeights);
      setSessionStatus(res.status);
      setRecommendations(mapCandidates(res.results.recommendations || []));
      setRelaxationOptions(res.results.relaxation_options || []);
      setSelectedMeal(null);
      setCartPreview(null);
    } catch (err) {
      showAlert(`Search failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleMealSelect = async (meal: RecommendationMeal) => {
    setSelectedMeal(meal);
    setCartLoading(true);
    setCheckoutConfirmed(false);
    setAppliedCoupon("");
    setApplicableCoupons([]);

    const prepareCartForSelectedMeal = async (allowRestaurantSwitch = false) => {
      await api.syncCart(activeSessionId, allowRestaurantSwitch);
      const cartInfo = await api.reviewCart(activeSessionId);
      setCartPreview(cartInfo.cart);
      setSessionStatus(cartInfo.status);
      try {
        setCouponsLoading(true);
        const couponsRes = await api.fetchCoupons(activeSessionId);
        setApplicableCoupons(couponsRes.coupons || []);
      } catch (couponErr) {
        console.error("Failed to load coupons", couponErr);
      } finally {
        setCouponsLoading(false);
      }
    };

    try {
      await api.selectItem(activeSessionId, meal.restaurant_id || "", meal.id);
      await prepareCartForSelectedMeal(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof ApiError && err.status === 409 && msg.includes("RESTAURANT_SWITCH_REQUIRED")) {
        const prompt = msg.replace("RESTAURANT_SWITCH_REQUIRED: ", "");
        const confirmedSwitch = window.confirm(`${prompt}\n\nReplace the current cart and continue?`);
        if (confirmedSwitch) {
          try {
            await prepareCartForSelectedMeal(true);
            showAlert("Previous restaurant cart replaced after your confirmation.", "info");
            return;
          } catch (switchErr) {
            showAlert(`Failed to prepare cart: ${switchErr instanceof Error ? switchErr.message : String(switchErr)}`, "error");
            return;
          }
        }
      }
      showAlert(`Failed to prepare cart: ${msg}`, "error");
    } finally {
      setCartLoading(false);
    }
  };

  const handleApplyCoupon = async (couponCode: string) => {
    try {
      setCartLoading(true);
      const res = await api.applyCoupon(activeSessionId, couponCode);
      setCartPreview(res.cart);
      setAppliedCoupon(couponCode);
      showAlert(`Coupon ${couponCode} applied successfully!`, "success");
    } catch (err) {
      showAlert(`Failed to apply coupon: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setCartLoading(false);
    }
  };

  const handleConfirmCheckbox = async (checked: boolean) => {
    setCheckoutConfirmed(checked);
    if (checked && activeSessionId) {
      try {
        const res = await api.confirmOrder(activeSessionId);
        setSessionStatus(res.status);
      } catch (err) {
        showAlert(`Confirmation failed: ${err instanceof Error ? err.message : String(err)}`, "error");
        setCheckoutConfirmed(false);
      }
    }
  };

  const handlePlaceOrder = async () => {
    if (!checkoutConfirmed) return;
    setOrderPlacing(true);
    try {
      const res = await api.placeOrder(activeSessionId, true);
      const orderId = res.order_res?.orderId || res.order_id || `order_mcp_${Math.floor(100000 + Math.random() * 900000)}`;
      setPlacedOrderId(orderId);
      setSessionStatus(res.status);
      coachDashboardRef.current?.refreshCoachData();

      let step = 0;
      const interval = setInterval(() => {
        step += 1;
        setTrackingStep(step);
        if (step >= 3) {
          clearInterval(interval);
          setShowFeedbackModal(true);
        }
      }, 4000);
      setTrackingIntervalId(interval);
    } catch (err) {
      showAlert(`Checkout failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setOrderPlacing(false);
    }
  };

  const handleFeedbackSubmit = async (feedback: { rating: number; filling: string; spicy: string; again: boolean }) => {
    setFeedbackLoading(true);
    try {
      await api.submitFeedback(activeSessionId, feedback);
      const prof = await api.getProfile();
      loadProfileFields(prof);
      setShowFeedbackModal(false);
      showAlert("Feedback saved! Your personalization rules have been updated.", "success");
    } catch (err) {
      showAlert(`Failed to save feedback: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleOnboardingSave = async (updatedProfile: UserProfile) => {
    setAuthLoading(true);
    try {
      await api.updateProfile(updatedProfile);
      const prof = await api.getProfile();
      loadProfileFields(prof);
      setEditingProfile(false);
      showAlert("Biometric targets calculated and synchronized successfully.", "success");
    } catch (err) {
      showAlert(`Failed to update biometric profile: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRelaxationApply = async (patch: Record<string, unknown>) => {
    setSearchLoading(true);
    try {
      const res = await api.searchRecommendations(activeSessionId, searchQuery, priorityWeights, patch);
      setSessionStatus(res.status);
      setRecommendations(mapCandidates(res.results.recommendations || []));
      setRelaxationOptions(res.results.relaxation_options || []);
      setSelectedMeal(null);
      setCartPreview(null);
    } catch (err) {
      showAlert(`Constraint relaxation search failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleReset = () => {
    if (trackingIntervalId) {
      clearInterval(trackingIntervalId);
      setTrackingIntervalId(null);
    }
    setSelectedAddress("");
    setActiveSessionId("");
    setSessionStatus("START");
    setSearchQuery("");
    setRecommendations([]);
    setSelectedMeal(null);
    setCartPreview(null);
    setCheckoutConfirmed(false);
    setPlacedOrderId("");
    setTrackingStep(0);
    setAppliedCoupon("");
    setApplicableCoupons([]);
  };

  const handleAllergyToggle = (allergen: string) => {
    const nextAllergies = allergies.includes(allergen)
      ? allergies.filter((a) => a !== allergen)
      : [...allergies, allergen];
    setAllergies(nextAllergies);
    syncProfileChange(fitnessGoal, proteinTarget, calorieTarget, nextAllergies);
  };

  // ── Render ────────────────────────────────────────────────

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

  return (
    <>
      <SwiggyConnectionCard />

      <DemoStoryBanner
        context={
          placedOrderId ? "order_placed" : selectedMeal ? "recommendation_selected" : recommendations.length > 0 ? "search_ready" : "just_seeded"
        }
      />

      <main className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 xl:gap-8 w-full">
        {/* Left Column: Address, Profile & Query */}
        <div className="xl:col-span-4 flex flex-col gap-4 sm:gap-8">
          <PriorityControls weights={priorityWeights} onChange={setPriorityWeights} />

          {/* Step 1: Address Selection */}
          <section className="bg-surface border border-border rounded-xl p-5 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-nutri">1. Delivery Address</h3>
              {selectedAddress && (
                <span title={`Order state: ${sessionStatus}`} className="text-[10px] bg-nutri/10 text-nutri font-semibold px-2 py-0.5 rounded border border-nutri/20">Session active</span>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {addresses.length === 0 ? (
                <p className="text-xs text-subtle text-center py-4">No addresses found.</p>
              ) : (
                addresses.map((addr) => {
                  const isChosen = selectedAddress === addr.id;
                  return (
                    <div key={addr.id} onClick={() => handleAddressSelect(addr.id)} className={`cursor-pointer border rounded-lg p-3 flex flex-col gap-1 transition ${isChosen ? "bg-surface-2 border-nutri shadow-sm" : "bg-surface-2/50 border-border hover:border-border-strong"}`}>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-text">{addr.label}</span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-nutri/10 text-nutri">Saved Address</span>
                      </div>
                      <p className="text-xs text-muted leading-relaxed mt-1">{addr.display_text}</p>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Step 2: Goal & Preferences Setup */}
          <section className="bg-surface border border-border rounded-xl p-5 shadow-sm flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-nutri">2. Nutritional Profile</h3>
              <button onClick={() => setEditingProfile(true)} className="text-[10px] text-nutri hover:underline">Edit Biometrics ⚙️</button>
            </div>
            <div className="bg-surface-2 rounded-xl p-4 border border-border text-xs text-muted flex flex-col gap-2">
              <p className="font-bold text-text">Biometric Targets Engine:</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] mt-1">
                <p>Daily Calories: <strong className="text-info">{profile?.daily_calories || calorieTarget * 3} kcal</strong></p>
                <p>Meal Calories: <strong className="text-info">{calorieTarget} kcal</strong></p>
                <p>Daily Protein: <strong className="text-nutri">{profile?.daily_protein || proteinTarget * 3}g</strong></p>
                <p>Meal Protein: <strong className="text-nutri">{proteinTarget}g</strong></p>
              </div>
              <p className="text-[10px] text-subtle mt-1 italic">
                Reasoning: {profile?.fitness_goal ? (profile.fitness_goal === "fat_loss" ? "High protein calorie deficit" : profile.fitness_goal === "muscle_gain" ? "Hypertrophic calorie surplus" : "Iso-caloric maintenance") : "Default weights active."}
              </p>
            </div>
            <div>
              <label className="block text-xs text-muted font-semibold mb-2">Goal Override</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "muscle_gain", label: "💪 Bulking" },
                  { id: "fat_loss", label: "🔥 Cutting" },
                  { id: "maintenance", label: "⚖️ Maintenance" },
                ].map((goal) => {
                  const active = fitnessGoal === goal.id;
                  return (
                    <button
                      key={goal.id}
                      onClick={() => {
                        setFitnessGoal(goal.id);
                        let prot = proteinTarget;
                        let cal = calorieTarget;
                        if (goal.id === "muscle_gain") { prot = 40; cal = 750; }
                        else if (goal.id === "fat_loss") { prot = 30; cal = 500; }
                        else { prot = 35; cal = 650; }
                        setProteinTarget(prot);
                        setCalorieTarget(cal);
                        syncProfileChange(goal.id, prot, cal, allergies);
                      }}
                      className={`text-xs font-semibold py-2 px-1 rounded-lg border transition ${active ? "bg-nutri border-nutri text-nutri-contrast font-bold" : "bg-surface-2 border-border text-muted hover:border-border-strong"}`}
                    >
                      {goal.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs text-muted">Min Protein Target</label>
                  <span className="text-xs font-bold text-nutri">{proteinTarget}g</span>
                </div>
                <input type="range" min="15" max="60" value={proteinTarget} onChange={(e) => { const v = Number(e.target.value); setProteinTarget(v); syncProfileChange(fitnessGoal, v, calorieTarget, allergies); }} className="w-full accent-nutri cursor-pointer" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs text-muted">Max Calorie Ceiling</label>
                  <span className="text-xs font-bold text-info">{calorieTarget} kcal</span>
                </div>
                <input type="range" min="350" max="1000" value={calorieTarget} onChange={(e) => { const v = Number(e.target.value); setCalorieTarget(v); syncProfileChange(fitnessGoal, proteinTarget, v, allergies); }} className="w-full accent-info cursor-pointer" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted font-semibold mb-2">Exclusions / Allergies</label>
              <div className="flex flex-wrap gap-2">
                {["Gluten", "Dairy", "Nuts", "Soy", "Shellfish"].map((allergen) => {
                  const selected = allergies.includes(allergen);
                  return (
                    <button key={allergen} onClick={() => handleAllergyToggle(allergen)} className={`text-xs px-2.5 py-1 rounded-full border transition ${selected ? "bg-danger/10 border-danger text-danger" : "bg-surface-2 border-border text-muted hover:border-border-strong"}`}>
                      {selected ? `❌ ${allergen}` : allergen}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Step 3: Order Assistant */}
          <section className="bg-surface border border-border rounded-xl p-5 shadow-sm flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-nutri">3. Order Assistant</h3>
            <form onSubmit={handleQuerySearch} className="flex flex-col gap-3">
              <textarea rows={2} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="e.g. High protein Paneer lunch with broccoli under Rs 300" className="w-full bg-surface-2 border border-border focus:border-nutri rounded-xl p-3 text-sm text-text placeholder:text-subtle focus:outline-none transition resize-none font-sans" />
              <div className="flex flex-wrap gap-1.5">
                {["high protein grilled chicken", "veg lunch under 600 kcal", "keto friendly dinner"].map((temp) => (
                  <button key={temp} type="button" onClick={() => setSearchQuery(temp)} className="text-[10px] bg-surface-2 border border-border text-subtle hover:text-muted hover:border-border-strong px-2 py-1 rounded transition">💡 {temp}</button>
                ))}
              </div>
              <button type="submit" disabled={searchLoading || !selectedAddress} className="w-full bg-nutri hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed text-nutri-contrast font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2 shadow-md">
                {searchLoading ? (
                  <>
                    <Spinner className="h-4 w-4 text-nutri-contrast" />
                    Finding your best meals…
                  </>
                ) : (
                  "Find Recommended Meal"
                )}
              </button>
            </form>
          </section>
        </div>

        {/* Middle Column: Recommendations & Checkout */}
        <div className="xl:col-span-4 flex flex-col gap-8">
          <section className="bg-surface border border-border rounded-xl p-5 shadow-sm flex-1 flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-nutri">4. AI Meal Recommendations</h3>
            <RelaxationOptions options={relaxationOptions} onApplyPatch={handleRelaxationApply} loading={searchLoading} />
            {searchLoading ? (
              <LoadingSkeleton />
            ) : recommendations.length === 0 ? (
              <div className="flex-1 border border-dashed border-border-strong rounded-xl flex flex-col items-center justify-center p-8 text-center text-subtle gap-2">
                <span className="text-3xl">🍲</span>
                <p className="text-sm">Select a delivery address, then describe what you feel like eating.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {recommendations.map((meal) => (
                  <RecommendationCard key={meal.id} meal={meal} onSelect={handleMealSelect} selected={selectedMeal?.id === meal.id} loading={cartLoading} />
                ))}
              </div>
            )}
          </section>

          <section className="bg-surface border border-border rounded-xl p-5 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-nutri">5. Cart Review</h3>
              {cartLoading && <span className="text-[10px] text-nutri font-mono animate-pulse">Syncing…</span>}
            </div>
            {!selectedMeal ? (
              <p className="text-xs text-subtle text-center py-4">Select a meal above to review your cart and checkout details.</p>
            ) : cartLoading ? (
              <div className="flex items-center justify-center py-6 gap-2">
                <Spinner className="h-5 w-5 text-nutri" />
                <span className="text-xs text-subtle font-mono">Synchronizing Swiggy cart…</span>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="bg-surface-2 rounded-xl p-4 border border-border text-sm flex flex-col gap-2">
                  <div className="flex justify-between"><span className="text-muted">Item Selected:</span><span className="font-semibold text-text">{selectedMeal.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Restaurant:</span><span className="font-semibold text-text">{cartPreview?.restaurantName || selectedMeal.restaurant}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Payment:</span><span className="font-semibold text-text">Cash On Delivery (COD)</span></div>
                  {cartPreview && cartPreview.discount_amount && cartPreview.discount_amount > 0 ? (
                    <div className="flex justify-between text-xs text-nutri"><span>Coupon Discount ({cartPreview.applied_coupon}):</span><span>- Rs {cartPreview.discount_amount}</span></div>
                  ) : null}
                  <div className="flex justify-between border-t border-border pt-2 font-bold text-text"><span>Total Amount:</span><span className="text-nutri">Rs {cartPreview?.total ?? selectedMeal.price}</span></div>
                </div>

                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <span className="text-xs text-subtle font-bold uppercase tracking-wider">🎟️ Available Coupons</span>
                  {couponsLoading ? (
                    <span className="text-xs text-subtle font-mono animate-pulse">Loading coupons…</span>
                  ) : applicableCoupons.length === 0 ? (
                    <span className="text-xs text-subtle">No applicable coupons found.</span>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {applicableCoupons.map((c) => (
                        <div key={c.code} className={`flex justify-between items-center p-2.5 rounded-xl border transition text-xs ${appliedCoupon === c.code ? "bg-nutri/10 border-nutri/40 text-nutri" : "bg-surface-2 border-border hover:border-border-strong text-text"}`}>
                          <div>
                            <p className="font-bold">{c.code}</p>
                            <p className="text-[10px] text-muted mt-0.5">{c.description}</p>
                          </div>
                          <button disabled={appliedCoupon === c.code || cartLoading} onClick={() => handleApplyCoupon(c.code)} className="bg-nutri disabled:opacity-50 text-nutri-contrast font-bold px-2.5 py-1 rounded-lg text-[10px] transition">{appliedCoupon === c.code ? "Applied" : "Apply"}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {(cartPreview?.total ?? selectedMeal.price) >= 1000 ? (
                  <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                    <span className="text-danger text-sm">❌</span>
                    <div><p className="font-bold text-text">Order Cap Exceeded</p><p className="text-muted mt-0.5">Total of Rs {cartPreview?.total ?? selectedMeal.price} meets or exceeds the Rs 1000 safety limit. Checkout is blocked.</p></div>
                  </div>
                ) : (cartPreview?.total ?? selectedMeal.price) >= 850 ? (
                  <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                    <span className="text-warning text-sm">⚠️</span>
                    <div><p className="font-bold text-text">Approaching Order Cap</p><p className="text-muted mt-0.5">Total of Rs {cartPreview?.total ?? selectedMeal.price} is close to the Rs 1000 safety limit.</p></div>
                  </div>
                ) : (
                  <div className="bg-success/10 border border-success/20 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                    <span className="text-success text-sm">🛡️</span>
                    <div><p className="font-bold text-text">Safety Checks Passed</p><p className="text-muted mt-0.5">Total is under the Rs 1000 cap and duplicate-order protection is active.</p></div>
                  </div>
                )}

                <label className="flex items-center gap-3 cursor-pointer select-none border border-border rounded-xl p-3 bg-surface-2 hover:bg-surface-3 transition">
                  <input type="checkbox" checked={checkoutConfirmed} onChange={(e) => handleConfirmCheckbox(e.target.checked)} className="accent-nutri h-4 w-4 rounded cursor-pointer" />
                  <div className="text-xs"><p className="font-semibold text-text">I confirm these details are correct</p><p className="text-subtle text-[10px] mt-0.5">Orders are only placed after your explicit confirmation.</p></div>
                </label>

                <button onClick={handlePlaceOrder} disabled={orderPlacing || !checkoutConfirmed || (cartPreview?.total ?? selectedMeal.price) >= 1000} className="w-full bg-nutri hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed text-nutri-contrast font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2 shadow-md uppercase tracking-wider text-xs">
                  {orderPlacing ? (
                    <>
                      <Spinner className="h-5 w-5 text-nutri-contrast" />
                      Placing Order…
                    </>
                  ) : (
                    "Place COD Order on Swiggy"
                  )}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Coach */}
        <div className="xl:col-span-4 flex flex-col gap-8">
          <CoachDashboard ref={coachDashboardRef} activeSessionId={activeSessionId} onSelectMeal={handleMealSelect} />
        </div>
      </main>

      {showFeedbackModal && (
        <FeedbackModal onSubmit={handleFeedbackSubmit} onClose={() => setShowFeedbackModal(false)} loading={feedbackLoading} />
      )}
    </>
  );
}
