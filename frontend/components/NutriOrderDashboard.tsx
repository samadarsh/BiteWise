'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { api, ApiError, BASE_URL, UserProfile, Address, RecommendationMeal, CartInfo, Coupon } from "../lib/api";
import OnboardingPanel from "../components/OnboardingPanel";
import PriorityControls, { PriorityWeights } from "../components/PriorityControls";
import RecommendationCard from "../components/RecommendationCard";
import RelaxationOptions, { RelaxationOption } from "../components/RelaxationOptions";
import FeedbackModal from "../components/FeedbackModal";
import CoachDashboard, { CoachDashboardRef } from "../components/CoachDashboard";
import DemoControlBar from "../components/DemoControlBar";
import DemoStoryBanner from "../components/DemoStoryBanner";
import AlertBanner from "../components/AlertBanner";
import LoadingSkeleton from "../components/LoadingSkeleton";
import HouseholdDashboard from "./household/HouseholdDashboard";
import NutriOrderView from "./nutriorder/NutriOrderView";
import SmartPantryView from "./smartpantry/SmartPantryView";
import { UserMenuHeader } from "./UserMenuHeader";
import { SwiggyConnectionCard } from "./SwiggyConnectionCard";
import { useAuth } from "../lib/auth-context";

interface SwiggyConfigStatus {
  use_mock_mcp: boolean;
  swiggy_env: string;
  database_connected: boolean;
  encryption_key_configured: boolean;
  client_id_configured: boolean;
  client_secret_configured: boolean;
  redirect_uri_configured: boolean;
}

export default function NutriOrderDashboard() {
  const { user: authUser, isAuthenticated, isSwiggyConnected, openAuthModal, loginAsGuest, connectSwiggy } = useAuth();

  // Authentication & Initialization
  const [activeTab, setActiveTab] = useState<"coach" | "household">("coach");
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [initializing, setInitializing] = useState<boolean>(true);

  // DB-Backed Core States
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>("");

  // Profile targets matching backend model
  const [fitnessGoal, setFitnessGoal] = useState<string>("maintenance");
  const [proteinTarget, setProteinTarget] = useState<number>(35);
  const [calorieTarget, setCalorieTarget] = useState<number>(650);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [favCuisines, setFavCuisines] = useState<string[]>([]);
  const [dietPreference, setDietPreference] = useState<string>("any");
  const coachDashboardRef = React.useRef<CoachDashboardRef>(null);
  const [alertMessage, setAlertMessage] = useState<string>("");
  const [alertType, setAlertType] = useState<"success" | "error" | "warning" | "info">("info");
  const [demoLoading, setDemoLoading] = useState<boolean>(false);

  // Session & Recommendation States
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [sessionStatus, setSessionStatus] = useState<string>("START");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [recommendations, setRecommendations] = useState<RecommendationMeal[]>([]);
  const [selectedMeal, setSelectedMeal] = useState<RecommendationMeal | null>(null);

  // Cart & Place States
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

  // Sprint 2 Personalized Intelligence States
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState<boolean>(false);
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

  const [swiggyStatus, setSwiggyStatus] = useState<SwiggyConfigStatus | null>(null);
  const [profileFetching, setProfileFetching] = useState<boolean>(false);

  // Load profile fields and addresses when authenticated
  useEffect(() => {
    async function loadUserData() {
      if (isAuthenticated) {
        setProfileFetching(true);
        if (authUser?.profile) {
          loadProfileFields(authUser.profile as UserProfile);
        } else {
          setProfile(null);
        }
        try {
          const prof = await api.getProfile();
          loadProfileFields(prof);
          await refreshAddresses();
        } catch {
          // Unauthenticated or profile missing
        } finally {
          setProfileFetching(false);
        }
      } else {
        setProfile(null);
        setProfileFetching(false);
      }
      setInitializing(false);

      try {
        const status = await api.getSwiggyStatus();
        setSwiggyStatus(status);
      } catch (err) {
        console.error("Failed to load Swiggy config status", err);
      }
    }
    loadUserData();
  }, [isAuthenticated, authUser?.id]);

  // Sync profile edits to backend DB
  const syncProfileChange = async (
    goal: string,
    protein: number,
    calories: number,
    allergyList: string[]
  ) => {
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
        spice_tolerance: profile?.spice_tolerance || "medium"
      });
    } catch (err) {
      console.error("Failed to save profile modifications", err);
    }
  };

  // Address Selection -> Starts DB Order Session
  const handleAddressSelect = async (addrId: string) => {
    setSelectedAddress(addrId);
    try {
      const sess = await api.startOrderSession();
      const boundSess = await api.selectAddress(sess.session_id, addrId);
      setActiveSessionId(sess.session_id);
      setSessionStatus(boundSess.status);

      // Reset subsequent flow items
      setRecommendations([]);
      setSelectedMeal(null);
      setCartPreview(null);
      setCheckoutConfirmed(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertType("error"); setAlertMessage(`Failed to start session: ${msg}`);
    }
  };

  // Query Search recommendations from backend
  const handleQuerySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSessionId) {
      setAlertType("warning"); setAlertMessage("Please select a delivery address to start an order session first!");
      return;
    }
    setSearchLoading(true);
    try {
      const res = await api.searchRecommendations(activeSessionId, searchQuery, priorityWeights);
      setSessionStatus(res.status);

      // Map candidates returned from pipeline
      const rawCandidates = res.results.recommendations || [];
      const mapped = rawCandidates.map((c) => ({
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
        distance_km: c.distance_km as number | undefined
      }));

      setRecommendations(mapped);
      setRelaxationOptions(res.results.relaxation_options || []);
      setSelectedMeal(null);
      setCartPreview(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertType("error"); setAlertMessage(`Search failed: ${msg}`);
    } finally {
      setSearchLoading(false);
    }
  };

  // Meal candidate selected -> Syncs cart with backend
  const handleMealSelect = async (meal: RecommendationMeal) => {
    setSelectedMeal(meal);
    setCartLoading(true);
    setCheckoutConfirmed(false);
    setAppliedCoupon("");
    setApplicableCoupons([]);

    const prepareCartForSelectedMeal = async (allowRestaurantSwitch = false) => {
      // Sync cart, then refresh the authoritative server-side cart before checkout.
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
      // 1. Post item selection
      await api.selectItem(activeSessionId, meal.restaurant_id || "", meal.id);

      await prepareCartForSelectedMeal(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        msg.includes("RESTAURANT_SWITCH_REQUIRED")
      ) {
        const prompt = msg.replace("RESTAURANT_SWITCH_REQUIRED: ", "");
        const confirmedSwitch = window.confirm(`${prompt}\n\nReplace the current cart and continue?`);
        if (confirmedSwitch) {
          try {
            await prepareCartForSelectedMeal(true);
            setAlertType("info");
            setAlertMessage("Previous restaurant cart replaced after your confirmation.");
            return;
          } catch (switchErr) {
            const switchMsg = switchErr instanceof Error ? switchErr.message : String(switchErr);
            setAlertType("error");
            setAlertMessage(`Failed to prepare cart: ${switchMsg}`);
            return;
          }
        }
      }
      setAlertType("error"); setAlertMessage(`Failed to prepare cart: ${msg}`);
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
      setAlertType("success"); setAlertMessage(`Coupon ${couponCode} applied successfully!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertType("error"); setAlertMessage(`Failed to apply coupon: ${msg}`);
    } finally {
      setCartLoading(false);
    }
  };

  // Checkout confirmation
  const handleConfirmCheckbox = async (checked: boolean) => {
    setCheckoutConfirmed(checked);
    if (checked && activeSessionId) {
      try {
        const res = await api.confirmOrder(activeSessionId);
        setSessionStatus(res.status);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAlertType("error"); setAlertMessage(`Confirmation failed: ${msg}`);
        setCheckoutConfirmed(false);
      }
    }
  };

  const handleSeedDemo = async () => {
    setDemoLoading(true);
    setAlertMessage("");
    try {
      const res = await api.seedDemo();
      setAlertType("success");
      setAlertMessage(res.message || "Demo data seeded successfully.");

      // Reload profile, addresses, and coach history
      const prof = await api.getProfile();
      loadProfileFields(prof);
      await refreshAddresses();

      // Clear active recommendation state
      setRecommendations([]);
      setSelectedMeal(null);
      setCartPreview(null);
      setAppliedCoupon("");
      setApplicableCoupons([]);
      setCheckoutConfirmed(false);

      // Refresh coach dashboard data!
      coachDashboardRef.current?.refreshCoachData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertType("error");
      setAlertMessage(`Demo seed failed: ${msg}`);
    } finally {
      setDemoLoading(false);
    }
  };

  const handleResetDemo = async () => {
    setDemoLoading(true);
    setAlertMessage("");
    try {
      const res = await api.resetDemo();
      setAlertType("success");
      setAlertMessage(res.message || "Demo session cleared and reset successfully.");

      // Reload profile, addresses, and coach history
      const prof = await api.getProfile();
      loadProfileFields(prof);
      await refreshAddresses();

      // Clear active recommendation state
      setRecommendations([]);
      setSelectedMeal(null);
      setCartPreview(null);
      setAppliedCoupon("");
      setApplicableCoupons([]);
      setCheckoutConfirmed(false);

      // Refresh coach dashboard data!
      coachDashboardRef.current?.refreshCoachData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertType("error");
      setAlertMessage(`Demo reset failed: ${msg}`);
    } finally {
      setDemoLoading(false);
    }
  };

  // Place COD Order execution
  const handlePlaceOrder = async () => {
    if (!checkoutConfirmed) return;
    setOrderPlacing(true);
    try {
      const res = await api.placeOrder(activeSessionId, true);
      const orderId = res.order_res?.orderId || res.order_id || `order_mcp_${Math.floor(100000 + Math.random() * 900000)}`;
      setPlacedOrderId(orderId);
      setSessionStatus(res.status);

      // Refresh Coach dashboard data!
      coachDashboardRef.current?.refreshCoachData();

      // Start live order tracking simulator
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
      const msg = err instanceof Error ? err.message : String(err);
      setAlertType("error"); setAlertMessage(`Checkout failed: ${msg}`);
    } finally {
      setOrderPlacing(false);
    }
  };

  // Feedback Submit handler
  const handleFeedbackSubmit = async (feedback: { rating: number; filling: string; spicy: string; again: boolean }) => {
    setFeedbackLoading(true);
    try {
      await api.submitFeedback(activeSessionId, feedback);
      // Reload profile to adjust weights
      const prof = await api.getProfile();
      loadProfileFields(prof);
      setShowFeedbackModal(false);
      setAlertType("success"); setAlertMessage("Feedback saved! Your personalization rules have been updated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertType("error"); setAlertMessage(`Failed to save feedback: ${msg}`);
    } finally {
      setFeedbackLoading(false);
    }
  };

  // Onboarding Save handler
  const handleOnboardingSave = async (updatedProfile: UserProfile) => {
    setAuthLoading(true);
    try {
      await api.updateProfile(updatedProfile);
      const prof = await api.getProfile();
      loadProfileFields(prof);
      setEditingProfile(false);
      setAlertType("success"); setAlertMessage("Biometric targets calculated and synchronized successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertType("error"); setAlertMessage(`Failed to update biometric profile: ${msg}`);
    } finally {
      setAuthLoading(false);
    }
  };

  // Smart Relaxation Apply handler
  const handleRelaxationApply = async (patch: Record<string, unknown>) => {
    setSearchLoading(true);
    try {
      const res = await api.searchRecommendations(
        activeSessionId,
        searchQuery,
        priorityWeights,
        patch
      );
      setSessionStatus(res.status);

      const rawCandidates = res.results.recommendations || [];
      const mapped = rawCandidates.map((c) => ({
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
        distance_km: c.distance_km as number | undefined
      }));

      setRecommendations(mapped);
      setRelaxationOptions(res.results.relaxation_options || []);
      setSelectedMeal(null);
      setCartPreview(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAlertType("error"); setAlertMessage(`Constraint relaxation search failed: ${msg}`);
    } finally {
      setSearchLoading(false);
    }
  };

  // Reset entire workflow helper
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

  // Toggle allergies checklist helper
  const handleAllergyToggle = (allergen: string) => {
    const nextAllergies = allergies.includes(allergen)
      ? allergies.filter(a => a !== allergen)
      : [...allergies, allergen];
    setAllergies(nextAllergies);
    syncProfileChange(fitnessGoal, proteinTarget, calorieTarget, nextAllergies);
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-slate-500 font-mono">Initializing staging sandbox...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Background Glows */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={handleReset}>
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-[#f4b544] text-xs sm:text-sm font-black text-slate-950">B</span>
            <div className="leading-tight hidden sm:block">
              <span className="block text-base font-bold bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">
                BiteWise
              </span>
              <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                NutriOrder AI · SmartPantry AI
              </span>
            </div>
            <span className="block sm:hidden text-sm font-bold bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">
              BiteWise
            </span>
            <span className="hidden sm:inline text-[10px] bg-emerald-500/10 text-emerald-400 font-semibold px-2 py-0.5 rounded-md border border-emerald-500/20">
              Demo Staging
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <UserMenuHeader onEditProfile={() => setEditingProfile(true)} />
          </div>
        </div>
      </header>

      {/* Main Container */}
      {!isAuthenticated ? (
        // Login Welcome Hero Screen
        <main className="flex-1 max-w-4xl mx-auto px-4 flex flex-col items-center justify-center text-center py-12 sm:py-20">
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 p-6 sm:p-10 rounded-2xl shadow-2xl max-w-xl w-full flex flex-col items-center gap-5 sm:gap-6">
            <div className="h-14 w-14 sm:h-16 sm:w-16 bg-gradient-to-tr from-emerald-400 to-lime-300 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shadow-xl shadow-emerald-500/15">
              🥗
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome to <span className="bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">BiteWise</span>
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Choose NutriOrder AI for health-aware meal ordering or SmartPantry AI for pantry, recipe, and grocery planning.
            </p>

            <button
              onClick={openAuthModal}
              className="w-full bg-[#f4b544] hover:bg-[#ffd071] text-[#17211c] font-black py-3.5 rounded-xl transition-all duration-200 text-sm sm:text-base shadow-xl hover:shadow-2xl hover:shadow-[#f4b544]/20 flex items-center justify-center gap-2"
            >
              Sign In to BiteWise
            </button>

            <button
              onClick={loginAsGuest}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition-all duration-200 text-sm sm:text-base shadow-xl border border-slate-700 hover:border-slate-600 flex items-center justify-center gap-2"
            >
              Continue as Guest
            </button>

            <Link
              href="/"
              className="text-slate-400 hover:text-slate-200 text-sm font-semibold underline transition-all mt-1"
            >
              Back to Landing Page
            </Link>
          </div>
        </main>
      ) : profileFetching ? (
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
          <svg className="animate-spin h-10 w-10 text-emerald-400 mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm font-semibold text-slate-300">Loading user profile & biometrics...</p>
        </main>
      ) : (!profile || !profile.weight_kg || !profile.height_cm || !profile.age || editingProfile) ? (
        // Onboarding panel if profile details are missing
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-12 flex items-center justify-center">
          <OnboardingPanel
            profile={profile || {
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
              spice_tolerance: "medium"
            }}
            onSave={handleOnboardingSave}
            loading={authLoading}
          />
        </main>
      ) : placedOrderId ? (
        // Tracking View
        <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-4 pt-4 sm:pt-8 pb-28 sm:pb-8">
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-4 sm:p-8 shadow-xl flex flex-col gap-5 sm:gap-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-slate-800 pb-4 sm:pb-6">
              <div>
                <span className="text-[10px] sm:text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full uppercase tracking-wider">
                  Order Dispatching
                </span>
                <h2 className="text-lg sm:text-2xl font-bold mt-2">Tracking {placedOrderId}</h2>
                <p className="text-[10px] sm:text-xs text-slate-500 mt-1 font-mono">Status: {sessionStatus}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-[10px] sm:text-xs text-slate-400">Estimated Delivery Time</p>
                <p className="text-xl sm:text-2xl font-bold text-emerald-400">{selectedMeal?.eta || "25 mins"}</p>
              </div>
            </div>

            {/* Stepper tracking progress bar */}
            <div className="relative w-full my-2 sm:my-4 px-1 sm:px-8 overflow-visible">
              {/* Background track */}
              <div className="absolute left-[12.5%] right-[12.5%] top-4 sm:top-5 h-1 bg-slate-800 rounded-full" />
              {/* Active progress */}
              <div
                className="absolute left-[12.5%] top-4 sm:top-5 h-1 bg-emerald-500 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(75, Math.max(0, (trackingStep / 3) * 75))}%` }}
              />

              <div className="relative z-10 grid grid-cols-4 gap-0">
              {[
                { label: "Placed", desc: "Sent to Staging MCP" },
                { label: "Accepted", desc: "Restaurant Confirmed" },
                { label: "Preparing", desc: "Culinary Macro Check" },
                { label: "Arriving", desc: "Staging Arrival" }
              ].map((step, idx) => {
                const active = trackingStep >= idx;
                const isCurrent = trackingStep === idx && trackingStep < 3;
                return (
                  <div key={idx} className="flex min-w-0 flex-col items-center text-center">
                    <div className={`relative z-10 h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs border-2 transition-all duration-500 ${
                      active
                        ? "bg-emerald-500 border-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                        : "bg-slate-900 border-slate-700 text-slate-600"
                    } ${isCurrent ? "ring-2 ring-emerald-500/30 ring-offset-2 ring-offset-slate-900" : ""}`}>
                      {active && trackingStep > idx ? (
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isCurrent ? (
                        <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 bg-slate-950 rounded-full animate-pulse" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <p className={`max-w-full truncate text-[10px] sm:text-xs font-semibold mt-2 sm:mt-3 ${active ? "text-slate-200" : "text-slate-600"}`}>{step.label}</p>
                    <p className="text-[8px] sm:text-[10px] text-slate-500 max-w-[70px] sm:max-w-[100px] mt-0.5 leading-tight hidden sm:block">{step.desc}</p>
                  </div>
                );
              })}
              </div>
            </div>

            {/* Meal summary details */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 sm:p-5 flex flex-col gap-3 sm:gap-4 mt-2 sm:mt-4">
              <h3 className="text-xs sm:text-sm font-bold text-slate-300">Order Summary</h3>
              <div className="flex justify-between items-center text-sm border-b border-slate-800/50 pb-3">
                <div>
                  <p className="font-semibold text-slate-200 text-xs sm:text-sm">{selectedMeal?.name}</p>
                  <p className="text-[10px] sm:text-xs text-slate-500">{selectedMeal?.restaurant}</p>
                </div>
                <p className="font-bold text-emerald-400 text-sm sm:text-base">Rs {selectedMeal?.price}</p>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                <div className="bg-slate-900 border border-slate-800/50 rounded-lg p-2 sm:p-2.5">
                  <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase font-bold tracking-wider">Macros Met</p>
                  <p className="text-xs sm:text-sm font-bold text-slate-300 mt-0.5 sm:mt-1">100% Correct</p>
                </div>
                <div className="bg-slate-900 border border-slate-800/50 rounded-lg p-2 sm:p-2.5">
                  <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase font-bold tracking-wider">Protein Total</p>
                  <p className="text-xs sm:text-sm font-bold text-emerald-400 mt-0.5 sm:mt-1">{selectedMeal?.protein}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800/50 rounded-lg p-2 sm:p-2.5">
                  <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase font-bold tracking-wider">Calories</p>
                  <p className="text-xs sm:text-sm font-bold text-blue-400 mt-0.5 sm:mt-1">{selectedMeal?.calories}</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="mt-2 sm:mt-6 mb-[env(safe-area-inset-bottom)] self-center bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-5 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm transition-all"
            >
              Order Something Else
            </button>
          </div>
        </main>
      ) : (
        // Dedicated Product Views
        <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-6 flex flex-col gap-4 sm:gap-6">
          
          {/* Top Product Switcher Navigation */}
          <div className="flex items-center justify-between border-b border-slate-900 pb-4">
            <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("coach")}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition flex items-center gap-2 ${
                  activeTab === "coach"
                    ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <span>🥗</span> <span>NutriOrder AI</span>
              </button>
              <button
                onClick={() => setActiveTab("household")}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition flex items-center gap-2 ${
                  activeTab === "household"
                    ? "bg-teal-400 text-slate-950 shadow-lg shadow-teal-400/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <span>🏡</span> <span>SmartPantry AI</span>
              </button>
            </div>

            <DemoControlBar
              onSeed={handleSeedDemo}
              onReset={handleResetDemo}
              loading={demoLoading}
            />
          </div>

          {activeTab === "coach" ? (
            <NutriOrderView
              profile={profile}
              addresses={addresses}
              selectedAddress={selectedAddress}
              onSelectAddress={setSelectedAddress}
              activeSessionId={activeSessionId}
              sessionStatus={sessionStatus}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              searchLoading={searchLoading}
              onSearch={handleSearch}
              recommendations={recommendations}
              selectedMeal={selectedMeal}
              onMealSelect={handleMealSelect}
              cartPreview={cartPreview}
              cartLoading={cartLoading}
              checkoutConfirmed={checkoutConfirmed}
              onConfirmCheckbox={handleConfirmCheckbox}
              orderPlacing={orderPlacing}
              onPlaceOrder={handlePlaceOrder}
              placedOrderId={placedOrderId}
              trackingStep={trackingStep}
              applicableCoupons={applicableCoupons}
              couponsLoading={couponsLoading}
              appliedCoupon={appliedCoupon}
              onApplyCoupon={handleApplyCoupon}
              relaxationOptions={relaxationOptions}
              onApplyRelaxation={handleRelaxationApply}
              priorityWeights={priorityWeights}
              onPriorityChange={setPriorityWeights}
              onEditProfile={() => setEditingProfile(true)}
              alertMessage={alertMessage}
              alertType={alertType}
              isSwiggyConnected={isSwiggyConnected}
              onConnectSwiggy={connectSwiggy}
            />
          ) : (
            <SmartPantryView />
          )}
        </div>
      )}

      {/* Post-Order Feedback Modal */}
      {showFeedbackModal && (
        <FeedbackModal
          onSubmit={handleFeedbackSubmit}
          onClose={() => setShowFeedbackModal(false)}
          loading={feedbackLoading}
        />
      )}
    </div>
  );
}
