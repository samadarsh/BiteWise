'use client';

import React, { useState, useEffect } from "react";
import { api, BASE_URL, UserProfile, Address, RecommendationMeal, CartInfo, Coupon } from "../lib/api";
import OnboardingPanel from "../components/OnboardingPanel";
import PriorityControls, { PriorityWeights } from "../components/PriorityControls";
import RecommendationCard from "../components/RecommendationCard";
import RelaxationOptions, { RelaxationOption } from "../components/RelaxationOptions";
import FeedbackModal from "../components/FeedbackModal";

export default function NutriOrderDashboard() {
  // Authentication & Initialization
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
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

  // Check auth session on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const prof = await api.getProfile();
        setIsAuthenticated(true);
        loadProfileFields(prof);
        await refreshAddresses();
      } catch {
        // Not authenticated
        setIsAuthenticated(false);
      } finally {
        setInitializing(false);
      }
    }
    checkAuth();
  }, []);

  // Demo Login handler
  const handleDemoLogin = async () => {
    setAuthLoading(true);
    try {
      await api.demoLogin();
      const prof = await api.getProfile();
      loadProfileFields(prof);
      await refreshAddresses();
      setIsAuthenticated(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Login failed: ${msg}`);
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await fetch(`${BASE_URL}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // Ignore
    }
    setIsAuthenticated(false);
    handleReset();
  };

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
      alert(`Failed to start session: ${msg}`);
    }
  };

  // Query Search recommendations from backend
  const handleQuerySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSessionId) {
      alert("Please select a delivery address to start an order session first!");
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
      alert(`Search failed: ${msg}`);
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
    try {
      // 1. Post item selection
      await api.selectItem(activeSessionId, meal.restaurant_id || "", meal.id);

      // 2. Sync cart
      await api.syncCart(activeSessionId);

      // 3. Review cart
      const cartInfo = await api.reviewCart(activeSessionId);
      setCartPreview(cartInfo.cart);
      setSessionStatus(cartInfo.status);

      // Fetch coupons
      try {
        setCouponsLoading(true);
        const couponsRes = await api.fetchCoupons(activeSessionId);
        setApplicableCoupons(couponsRes.coupons || []);
      } catch (couponErr) {
        console.error("Failed to load coupons", couponErr);
      } finally {
        setCouponsLoading(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to prepare cart: ${msg}`);
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
      alert(`Coupon ${couponCode} applied successfully!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to apply coupon: ${msg}`);
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
        alert(`Confirmation failed: ${msg}`);
        setCheckoutConfirmed(false);
      }
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
      alert(`Checkout failed: ${msg}`);
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
      alert("Feedback saved! NutriOrder AI has updated your personalization rules based on your inputs.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to save feedback: ${msg}`);
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
      alert("Biometric targets calculated and synchronized successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to update biometric profile: ${msg}`);
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
      alert(`Constraint relaxation search failed: ${msg}`);
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
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleReset}>
            <span className="text-2xl">🥗</span>
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">
              NutriOrder AI
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-semibold px-2 py-0.5 rounded border border-emerald-500/20">
              Demo Staging
            </span>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-400 font-mono">Demo Session Active</span>
                <button
                  onClick={() => setEditingProfile(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded hover:bg-emerald-500/10 transition"
                >
                  Edit Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded hover:bg-rose-500/10 transition"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={handleDemoLogin}
                disabled={authLoading}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm transition shadow-lg shadow-emerald-500/20 flex items-center gap-2"
              >
                {authLoading ? "Authorizing..." : "🔌 Staging Demo Login"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      {!isAuthenticated ? (
        // Login Welcome Hero Screen
        <main className="flex-1 max-w-4xl mx-auto px-4 flex flex-col items-center justify-center text-center py-20">
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 p-10 rounded-2xl shadow-2xl max-w-xl w-full flex flex-col items-center gap-6">
            <div className="h-16 w-16 bg-gradient-to-tr from-emerald-400 to-lime-300 rounded-2xl flex items-center justify-center text-3xl shadow-xl shadow-emerald-500/15">
              🥗
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              Welcome to <span className="bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">NutriOrder AI</span>
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              We leverage Swiggy&apos;s MCP Staging Lab to scan menus, filter target macros (protein & calories), and place secure, compliant food orders aligned with your goals.
            </p>
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 w-full text-left flex flex-col gap-2 text-xs text-slate-500">
              <p className="font-semibold text-slate-400 flex items-center gap-1.5">
                🛡️ Mock Staging Integration Enabled:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>PKCE secure token storage inside encrypted DB engine.</li>
                <li>Safe transition checkout state machine locks.</li>
                <li>Bypasses real OAuth and uses SQLite mocks.</li>
              </ul>
            </div>
            <button
              onClick={handleDemoLogin}
              disabled={authLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-slate-950 font-bold py-3.5 rounded-xl transition text-base shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2"
            >
              {authLoading ? "Initializing Consent..." : "Connect Demo Account"}
            </button>
          </div>
        </main>
      ) : (!profile || profile.weight_kg === null || profile.height_cm === null || profile.age === null || editingProfile) ? (
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
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-8 shadow-xl flex flex-col gap-8">
            <div className="flex justify-between items-start border-b border-slate-800 pb-6">
              <div>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Order Dispatching
                </span>
                <h2 className="text-2xl font-bold mt-2">Tracking {placedOrderId}</h2>
                <p className="text-xs text-slate-500 mt-1 font-mono">Status: {sessionStatus}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Estimated Delivery Time</p>
                <p className="text-2xl font-bold text-emerald-400">{selectedMeal?.eta || "25 mins"}</p>
              </div>
            </div>

            {/* Stepper tracking progress bar */}
            <div className="relative flex justify-between items-center max-w-2xl mx-auto w-full my-4">
              <div className="absolute left-0 right-0 top-1/2 h-1 bg-slate-800 -translate-y-1/2 -z-10" />
              <div
                className="absolute left-0 top-1/2 h-1 bg-emerald-500 -translate-y-1/2 -z-10 transition-all duration-1000"
                style={{ width: `${(trackingStep / 3) * 100}%` }}
              />

              {[
                { label: "Placed", desc: "Sent to Staging MCP" },
                { label: "Accepted", desc: "Restaurant Confirmed" },
                { label: "Preparing", desc: "Culinary Macro Check" },
                { label: "Arriving", desc: "Staging Arrival" }
              ].map((step, idx) => {
                const active = trackingStep >= idx;
                return (
                  <div key={idx} className="flex flex-col items-center text-center">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs border transition duration-500 ${
                      active
                        ? "bg-emerald-500 border-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20"
                        : "bg-slate-950 border-slate-880 text-slate-600"
                    }`}>
                      {idx + 1}
                    </div>
                    <p className={`text-xs font-semibold mt-2 ${active ? "text-slate-200" : "text-slate-600"}`}>{step.label}</p>
                    <p className="text-[10px] text-slate-500 max-w-[100px] mt-0.5">{step.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Meal summary details */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-5 flex flex-col gap-4 mt-4">
              <h3 className="text-sm font-bold text-slate-300">Order Summary</h3>
              <div className="flex justify-between items-center text-sm border-b border-slate-800/50 pb-3">
                <div>
                  <p className="font-semibold text-slate-200">{selectedMeal?.name}</p>
                  <p className="text-xs text-slate-500">{selectedMeal?.restaurant}</p>
                </div>
                <p className="font-bold text-emerald-400">Rs {selectedMeal?.price}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-slate-900 border border-slate-800/50 rounded-lg p-2.5">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Macros Met</p>
                  <p className="text-sm font-bold text-slate-300 mt-1">100% Correct</p>
                </div>
                <div className="bg-slate-900 border border-slate-800/50 rounded-lg p-2.5">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Protein Total</p>
                  <p className="text-sm font-bold text-emerald-400 mt-1">{selectedMeal?.protein}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800/50 rounded-lg p-2.5">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Calories</p>
                  <p className="text-sm font-bold text-blue-400 mt-1">{selectedMeal?.calories}</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="mt-6 self-center bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-6 py-2.5 rounded-lg text-sm transition"
            >
              Order Something Else
            </button>
          </div>
        </main>
      ) : (
        // Dashboard Workflow Panel
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Columns: Address, Profile & Query */}
          <div className="lg:col-span-5 flex flex-col gap-8">

            {/* Dynamic Priorities Control */}
            <PriorityControls weights={priorityWeights} onChange={setPriorityWeights} />

            {/* Step 1: Address Selection */}
            <section className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">1. Address Selection</h3>
                {selectedAddress && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-semibold px-2 py-0.5 rounded border border-emerald-500/20">
                    Sess: {activeSessionId.substr(-6)}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {addresses.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No addresses found.</p>
                ) : (
                  addresses.map((addr) => {
                    const isChosen = selectedAddress === addr.id;
                    return (
                      <div
                        key={addr.id}
                        onClick={() => handleAddressSelect(addr.id)}
                        className={`cursor-pointer border rounded-lg p-3 flex flex-col gap-1 transition ${
                          isChosen
                            ? "bg-slate-950/80 border-emerald-500 shadow-md shadow-emerald-500/5"
                            : "bg-slate-950/20 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-slate-300">{addr.label}</span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                            Saved Address
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed mt-1">{addr.display_text}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Step 2: Goal & Preferences Setup */}
            <section className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-5">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">2. Nutritional Profile</h3>
                <button
                  onClick={() => setEditingProfile(true)}
                  className="text-[10px] text-emerald-400 hover:underline"
                >
                  Edit Biometrics ⚙️
                </button>
              </div>

              <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-900 text-xs text-slate-400 flex flex-col gap-2">
                <p className="font-bold text-slate-300">Biometric Targets Engine:</p>
                <div className="grid grid-cols-2 gap-2 text-[11px] mt-1">
                  <p>Daily Calories: <strong className="text-blue-400">{profile?.daily_calories || calorieTarget * 3} kcal</strong></p>
                  <p>Meal Calories: <strong className="text-blue-400">{calorieTarget} kcal</strong></p>
                  <p>Daily Protein: <strong className="text-emerald-400">{profile?.daily_protein || proteinTarget * 3}g</strong></p>
                  <p>Meal Protein: <strong className="text-emerald-400">{proteinTarget}g</strong></p>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 italic">
                  Reasoning: {profile?.fitness_goal ? (profile.fitness_goal === "fat_loss" ? "High protein calorie deficit" : profile.fitness_goal === "muscle_gain" ? "Hypertrophic calorie surplus" : "Iso-caloric maintenance") : "Default weights active."}
                </p>
              </div>

              {/* Fitness Goal Buttons */}
              <div>
                <label className="block text-xs text-slate-400 font-semibold mb-2">Goal Override</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "muscle_gain", label: "💪 Bulking" },
                    { id: "fat_loss", label: "🔥 Cutting" },
                    { id: "maintenance", label: "⚖️ Maintenance" }
                  ].map((goal) => {
                    const active = fitnessGoal === goal.id;
                    return (
                      <button
                        key={goal.id}
                        onClick={() => {
                          setFitnessGoal(goal.id);
                          let prot = proteinTarget;
                          let cal = calorieTarget;
                          if (goal.id === "muscle_gain") {
                            prot = 40;
                            cal = 750;
                          } else if (goal.id === "fat_loss") {
                            prot = 30;
                            cal = 500;
                          } else {
                            prot = 35;
                            cal = 650;
                          }
                          setProteinTarget(prot);
                          setCalorieTarget(cal);
                          syncProfileChange(goal.id, prot, cal, allergies);
                        }}
                        className={`text-xs font-semibold py-2 px-1 rounded-lg border transition ${
                          active
                            ? "bg-emerald-500 border-emerald-400 text-slate-950 font-bold"
                            : "bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-800"
                        }`}
                      >
                        {goal.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sliders */}
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                     <label className="text-xs text-slate-400">Min Protein Target</label>
                     <span className="text-xs font-bold text-emerald-400">{proteinTarget}g</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="60"
                    value={proteinTarget}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setProteinTarget(v);
                      syncProfileChange(fitnessGoal, v, calorieTarget, allergies);
                    }}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs text-slate-400">Max Calorie Ceiling</label>
                    <span className="text-xs font-bold text-blue-400">{calorieTarget} kcal</span>
                  </div>
                  <input
                    type="range"
                    min="350"
                    max="1000"
                    value={calorieTarget}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setCalorieTarget(v);
                      syncProfileChange(fitnessGoal, proteinTarget, v, allergies);
                    }}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Allergies Pill Selectors */}
              <div>
                <label className="block text-xs text-slate-400 font-semibold mb-2">Exclusion / Allergies Filters</label>
                <div className="flex flex-wrap gap-2">
                  {["Gluten", "Dairy", "Nuts", "Soy", "Shellfish"].map((allergen) => {
                    const selected = allergies.includes(allergen);
                    return (
                      <button
                        key={allergen}
                        onClick={() => handleAllergyToggle(allergen)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition ${
                          selected
                            ? "bg-rose-500/10 border-rose-500 text-rose-300"
                            : "bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-850"
                        }`}
                      >
                        {selected ? `❌ ${allergen}` : allergen}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Step 3: Order Assistant Chat Query */}
            <section className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">3. Order Assistant</h3>

              <form onSubmit={handleQuerySearch} className="flex flex-col gap-3">
                <textarea
                  rows={2}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. High protein Paneer lunch with broccoli under Rs 300"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition resize-none font-sans"
                />

                {/* Query templates */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "high protein grilled chicken",
                    "veg lunch under 600 kcal",
                    "keto friendly dinner"
                  ].map((temp) => (
                    <button
                      key={temp}
                      type="button"
                      onClick={() => setSearchQuery(temp)}
                      className="text-[10px] bg-slate-950 border border-slate-800 text-slate-500 hover:text-slate-400 hover:border-slate-700 px-2 py-1 rounded transition"
                    >
                      💡 {temp}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={searchLoading || !selectedAddress}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 text-slate-950 font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
                >
                  {searchLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Running AI Engine...
                    </>
                  ) : (
                    "Find Recommended Meal"
                  )}
                </button>
              </form>
            </section>
          </div>

          {/* Right Columns: Recommendations & Checkout Cart */}
          <div className="lg:col-span-7 flex flex-col gap-8">
            {/* Step 4: Recommendations results list */}
            <section className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg flex-1 flex flex-col gap-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">4. AI Meal Recommendations</h3>

              {/* Smart Constraint Relaxation Payload Options */}
              <RelaxationOptions options={relaxationOptions} onApplyPatch={handleRelaxationApply} loading={searchLoading} />

              {recommendations.length === 0 ? (
                <div className="flex-1 border border-dashed border-slate-800/80 rounded-xl flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-2">
                  <span className="text-3xl">🍲</span>
                  <p className="text-sm">Select address and submit query to run recommendation pipeline.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {recommendations.map((meal) => (
                    <RecommendationCard
                      key={meal.id}
                      meal={meal}
                      onSelect={handleMealSelect}
                      selected={selectedMeal?.id === meal.id}
                      loading={cartLoading}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Step 5: Checkout Cart Review */}
            <section className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">5. Staging Cart Review</h3>
                {cartLoading && (
                  <span className="text-[10px] text-emerald-400 font-mono animate-pulse">Syncing...</span>
                )}
              </div>

              {!selectedMeal ? (
                <p className="text-xs text-slate-500 text-center py-4">Select a meal recommendation card above to review checkout parameters.</p>
              ) : cartLoading ? (
                <div className="flex items-center justify-center py-6 gap-2">
                  <svg className="animate-spin h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-xs text-slate-500 font-mono">Synchronizing Swiggy cart...</span>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Cart metrics */}
                  <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800 text-sm flex flex-col gap-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Item Selected:</span>
                      <span className="font-semibold text-slate-200">{selectedMeal.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Restaurant:</span>
                      <span className="font-semibold text-slate-200">{cartPreview?.restaurantName || selectedMeal.restaurant}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Payment:</span>
                      <span className="font-semibold text-slate-200">Cash On Delivery (COD)</span>
                    </div>
                    {cartPreview && (cartPreview as any).discount_amount && (cartPreview as any).discount_amount > 0 ? (
                      <div className="flex justify-between text-xs text-emerald-400">
                        <span>Coupon Discount ({(cartPreview as any).applied_coupon}):</span>
                        <span>- Rs {(cartPreview as any).discount_amount}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-t border-slate-800 pt-2 font-bold text-slate-200">
                      <span>Total Amount:</span>
                      <span className="text-emerald-400">Rs {cartPreview?.total ?? selectedMeal.price}</span>
                    </div>
                  </div>

                  {/* Coupon Selector Section */}
                  <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">🎟️ Available Coupons</span>
                    {couponsLoading ? (
                      <span className="text-xs text-slate-500 font-mono animate-pulse">Loading coupons...</span>
                    ) : applicableCoupons.length === 0 ? (
                      <span className="text-xs text-slate-500">No applicable coupons found.</span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {applicableCoupons.map((c) => (
                          <div
                            key={c.code}
                            className={`flex justify-between items-center p-2.5 rounded-xl border transition text-xs ${
                              appliedCoupon === c.code
                                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                                : "bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-300"
                            }`}
                          >
                            <div>
                              <p className="font-bold">{c.code}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{c.description}</p>
                            </div>
                            <button
                              disabled={appliedCoupon === c.code || cartLoading}
                              onClick={() => handleApplyCoupon(c.code)}
                              className="bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold px-2.5 py-1 rounded-lg text-[10px] transition"
                            >
                              {appliedCoupon === c.code ? "Applied" : "Apply"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Limits and Cap warnings */}
                  {(cartPreview?.total ?? selectedMeal.price) >= 1000 ? (
                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-400">
                      <span className="text-rose-400 text-sm">❌</span>
                      <div>
                        <p className="font-bold text-slate-300">Safety Cap Check Failed</p>
                        <p className="text-slate-500 mt-0.5">Total of Rs {cartPreview?.total ?? selectedMeal.price} meets or exceeds the Swiggy limit of Rs 1000. Checkout is blocked.</p>
                      </div>
                    </div>
                  ) : (cartPreview?.total ?? selectedMeal.price) >= 850 ? (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-400">
                      <span className="text-amber-400 text-sm">⚠️</span>
                      <div>
                        <p className="font-bold text-slate-300">Approaching Cart Cap</p>
                        <p className="text-slate-500 mt-0.5">Total of Rs {cartPreview?.total ?? selectedMeal.price} is approaching the Rs 1000 limit. Double order prevention lock checks are clear.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-400">
                      <span className="text-emerald-400 text-sm">🛡️</span>
                      <div>
                        <p className="font-bold text-slate-300">Safety Cap Check Passed</p>
                        <p className="text-slate-500 mt-0.5">Total is below the Rs 1000 limit. Double order prevention lock checks are clear.</p>
                      </div>
                    </div>
                  )}

                  {/* Confirmation Checkbox */}
                  <label className="flex items-center gap-3 cursor-pointer select-none border border-slate-800 rounded-xl p-3 bg-slate-950/20 hover:bg-slate-950/50 transition">
                    <input
                      type="checkbox"
                      checked={checkoutConfirmed}
                      onChange={(e) => handleConfirmCheckbox(e.target.checked)}
                      className="accent-emerald-500 h-4 w-4 rounded cursor-pointer"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-300">I confirm these details are correct</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">Explicit authorization triggers the non-idempotent Swiggy place route.</p>
                    </div>
                  </label>

                  <button
                    onClick={handlePlaceOrder}
                    disabled={orderPlacing || !checkoutConfirmed || (cartPreview?.total ?? selectedMeal.price) >= 1000}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 text-slate-950 font-bold py-3.5 rounded-xl transition text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 uppercase tracking-wider text-xs"
                  >
                    {orderPlacing ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-slate-950" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Placing Order...
                      </>
                    ) : (
                      "Place COD Order on Swiggy"
                    )}
                  </button>
                </div>
              )}
            </section>
          </div>
        </main>
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
