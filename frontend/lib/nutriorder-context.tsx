"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, UserProfile, Address, RecommendationMeal, CartInfo, Coupon, isSwiggyReauthError, SWIGGY_REAUTH_MESSAGE } from "./api";
import { PriorityWeights } from "../components/PriorityControls";
import { RelaxationOption } from "../components/RelaxationOptions";
import { CoachDashboardRef } from "../components/CoachDashboard";
import { useAuth } from "./auth-context";
import { useDashboard } from "./dashboard-context";

const ADDRESS_STORAGE_KEY = "bitewise_nutriorder_address_id";
// Reconnecting Swiggy mid-order is a full-page redirect (OAuth can't happen
// in an iframe/XHR) — everything below lives only in memory and would
// otherwise be silently wiped, forcing the user to redo their whole search.
// Snapshotted here whenever an order is in flight, restored once on the
// next mount.
const INFLIGHT_ORDER_STORAGE_KEY = "bitewise_nutriorder_inflight_order";
// Sentinel for "order placed successfully, but Swiggy's response didn't
// include a resolvable order ID" — never fabricate a fake-looking one.
export const CONFIRMED_NO_ID_SENTINEL = "__confirmed_no_id__";

interface NutriOrderContextType {
  // Profile
  fitnessGoal: string;
  setFitnessGoal: (v: string) => void;
  proteinTarget: number;
  setProteinTarget: (v: number) => void;
  calorieTarget: number;
  setCalorieTarget: (v: number) => void;
  allergies: string[];
  dislikes: string[];
  favCuisines: string[];
  dietPreference: string;
  profile: UserProfile | null;
  editingProfile: boolean;
  setEditingProfile: (v: boolean) => void;
  profileFetching: boolean;
  authLoading: boolean;

  // Addresses & session
  addresses: Address[];
  selectedAddress: string;
  activeSessionId: string;
  sessionStatus: string;

  // Search / recommendations / cart
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchLoading: boolean;
  recommendations: RecommendationMeal[];
  selectedMeal: RecommendationMeal | null;
  cartPreview: CartInfo | null;
  cartLoading: boolean;
  checkoutConfirmed: boolean;
  orderPlacing: boolean;
  placedOrderId: string;
  trackingStep: number;
  applicableCoupons: Coupon[];
  couponsLoading: boolean;
  appliedCoupon: string;
  relaxationOptions: RelaxationOption[];
  noResultsMessage: string | null;
  showFeedbackModal: boolean;
  setShowFeedbackModal: (v: boolean) => void;
  feedbackLoading: boolean;
  priorityWeights: PriorityWeights;
  setPriorityWeights: (v: PriorityWeights) => void;

  coachDashboardRef: React.RefObject<CoachDashboardRef | null>;

  // Handlers
  syncProfileChange: (goal: string, protein: number, calories: number, allergyList: string[]) => Promise<void>;
  handleAddressSelect: (addrId: string) => Promise<void>;
  handleQuerySearch: (e?: React.FormEvent) => Promise<void>;
  handleMealSelect: (meal: RecommendationMeal) => Promise<void>;
  handleApplyCoupon: (couponCode: string) => Promise<void>;
  handleConfirmCheckbox: (checked: boolean) => Promise<void>;
  handlePlaceOrder: () => Promise<void>;
  handleFeedbackSubmit: (feedback: { rating: number; filling: string; spicy: string; again: boolean }) => Promise<void>;
  handleOnboardingSave: (updatedProfile: UserProfile) => Promise<void>;
  handleRelaxationApply: (patch: Record<string, unknown>) => Promise<void>;
  handleReset: () => void;
  handleAllergyToggle: (allergen: string) => void;
}

const NutriOrderContext = createContext<NutriOrderContextType | undefined>(undefined);

export function NutriOrderProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser, isAuthenticated, refreshAuth } = useAuth();
  const { dataVersion, showAlert, editProfileRequested, clearEditProfileRequest } = useDashboard();

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

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [sessionStatus, setSessionStatus] = useState<string>("START");
  // Restore a previously-chosen address exactly once per mount — not on every
  // dataVersion-triggered reload (e.g. after a demo reset), which would
  // otherwise clobber whatever the user has actively picked since then.
  const hasRestoredAddressRef = useRef(false);
  const hasRestoredInflightOrderRef = useRef(false);

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
  // The pipeline's own explanation for a zero-result search — distinct from
  // the pre-search empty state, which previously looked identical.
  const [noResultsMessage, setNoResultsMessage] = useState<string | null>(null);
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

  // Mirror the in-progress order to sessionStorage while it's active, so a
  // Swiggy reconnect (a hard page redirect — OAuth can't happen client-side)
  // doesn't lose it. Cleared once there's nothing in flight to protect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeSessionId) {
      sessionStorage.removeItem(INFLIGHT_ORDER_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      INFLIGHT_ORDER_STORAGE_KEY,
      JSON.stringify({ activeSessionId, sessionStatus, selectedMeal, cartPreview, recommendations })
    );
  }, [activeSessionId, sessionStatus, selectedMeal, cartPreview, recommendations]);

  const loadProfileFields = (prof: UserProfile) => {
    setProfile(prof);
    setFitnessGoal(prof.fitness_goal);
    setProteinTarget(prof.protein_target);
    setCalorieTarget(prof.calorie_target);
    setDietPreference(prof.diet_preference || "any");
    setAllergies(prof.allergies || []);
    setDislikes(prof.dislikes || []);
    setFavCuisines(prof.favorite_cuisines || []);
    if (prof.priority_weights && Object.keys(prof.priority_weights).length > 0) {
      setPriorityWeights((prev) => ({ ...prev, ...prof.priority_weights }));
    }
  };

  const refreshAddresses = async (): Promise<Address[]> => {
    try {
      const addrs = await api.getAddresses();
      setAddresses(addrs);
      return addrs;
    } catch (err) {
      // Not linking Swiggy yet is an expected onboarding state, not a
      // failure — don't surface it as console.error (which Next.js's dev
      // overlay counts as an "Issue").
      if (isSwiggyReauthError(err)) {
        console.warn("Addresses unavailable — Swiggy not connected yet", err);
      } else {
        console.error("Failed to load addresses", err);
      }
      return [];
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
      // Persist so a page refresh doesn't lose the chosen delivery address —
      // this is a durable preference, not per-session scratch state.
      if (typeof window !== "undefined") {
        localStorage.setItem(ADDRESS_STORAGE_KEY, addrId);
      }
    } catch (err) {
      showAlert(`Failed to start session: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
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
        const addrs = await refreshAddresses();

        if (!hasRestoredAddressRef.current) {
          hasRestoredAddressRef.current = true;
          const savedAddressId = typeof window !== "undefined" ? localStorage.getItem(ADDRESS_STORAGE_KEY) : null;
          const stillValid = savedAddressId && addrs.some((a) => a.id === savedAddressId);
          if (stillValid && !cancelled) {
            await handleAddressSelect(savedAddressId);
          }
        }

        if (!hasRestoredInflightOrderRef.current) {
          hasRestoredInflightOrderRef.current = true;
          const raw = typeof window !== "undefined" ? sessionStorage.getItem(INFLIGHT_ORDER_STORAGE_KEY) : null;
          if (raw && !cancelled) {
            sessionStorage.removeItem(INFLIGHT_ORDER_STORAGE_KEY);
            try {
              const saved = JSON.parse(raw);
              if (saved.activeSessionId) {
                setActiveSessionId(saved.activeSessionId);
                setSessionStatus(saved.sessionStatus || "START");
                setSelectedMeal(saved.selectedMeal || null);
                setCartPreview(saved.cartPreview || null);
                setRecommendations(saved.recommendations || []);
              }
            } catch {
              // Malformed snapshot — nothing worth recovering.
            }
          }
        }
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
        priority_weights: priorityWeights,
      });
    } catch (err) {
      console.error("Failed to save profile modifications", err);
    }
  };

  const mapCandidates = (rawCandidates: NonNullable<Awaited<ReturnType<typeof api.searchRecommendations>>["results"]["recommendations"]>) =>
    rawCandidates.map((c) => ({
      id: c.item_id,
      name: c.name || c.item_name || "Recommended meal",
      restaurant: c.restaurant_name || "Unknown Restaurant",
      price: c.price,
      // Swiggy's search_menu gives no delivery-time signal at all — a fake
      // "30 mins" used to be shown for every real item regardless. Only
      // render an ETA when the backend actually has one.
      eta: c.delivery_time_min != null ? `${c.delivery_time_min} mins` : (c.delivery_time_spoken as string | undefined),
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
      distance_km: (c.distance_km ?? undefined) as number | undefined,
    }));

  const handleQuerySearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeSessionId) {
      showAlert("Please select a delivery address to start an order session first!", "warning");
      return;
    }
    if (!searchQuery.trim()) {
      showAlert("Please describe what you'd like to eat before searching.", "warning");
      return;
    }
    setSearchLoading(true);
    setNoResultsMessage(null);
    try {
      const res = await api.searchRecommendations(activeSessionId, searchQuery, priorityWeights);
      setSessionStatus(res.status);
      const candidates = res.results.recommendations || [];
      setRecommendations(mapCandidates(candidates));
      setRelaxationOptions(res.results.relaxation_options || []);
      setNoResultsMessage(candidates.length === 0 ? res.results.message || null : null);
      setSelectedMeal(null);
      setCartPreview(null);
    } catch (err) {
      if (isSwiggyReauthError(err)) {
        refreshAuth(); // stale token was purged server-side — reflect "not connected" immediately, not just show a message
        showAlert(SWIGGY_REAUTH_MESSAGE, "warning");
      } else {
        showAlert(`Search failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const handleMealSelect = async (meal: RecommendationMeal) => {
    let sid = activeSessionId;
    if (!sid) {
      // Coach can offer a meal to select before the user has ever picked a
      // delivery address (no session exists yet) — fall back to their first
      // saved address so selection doesn't silently 404 on an empty session id.
      if (addresses.length === 0) {
        showAlert("Add a delivery address on the Order page first.", "error");
        return;
      }
      try {
        const sess = await api.startOrderSession();
        const boundSess = await api.selectAddress(sess.session_id, addresses[0].id);
        sid = sess.session_id;
        setActiveSessionId(sid);
        setSelectedAddress(addresses[0].id);
        setSessionStatus(boundSess.status);
      } catch (err) {
        showAlert(`Failed to start session: ${err instanceof Error ? err.message : String(err)}`, "error");
        return;
      }
    }

    setSelectedMeal(meal);
    setCartLoading(true);
    setCheckoutConfirmed(false);
    setAppliedCoupon("");
    setApplicableCoupons([]);

    const prepareCartForSelectedMeal = async (allowRestaurantSwitch = false) => {
      await api.syncCart(sid, allowRestaurantSwitch);
      const cartInfo = await api.reviewCart(sid);
      setCartPreview(cartInfo.cart);
      setSessionStatus(cartInfo.status);
      try {
        setCouponsLoading(true);
        const couponsRes = await api.fetchCoupons(sid);
        setApplicableCoupons(couponsRes.coupons || []);
      } catch (couponErr) {
        console.error("Failed to load coupons", couponErr);
      } finally {
        setCouponsLoading(false);
      }
    };

    try {
      await api.selectItem(sid, meal.restaurant_id || "", meal.id);
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
      if (isSwiggyReauthError(err)) {
        refreshAuth(); // stale token was purged server-side — reflect "not connected" immediately, not just show a message
        showAlert(SWIGGY_REAUTH_MESSAGE, "warning");
      } else {
        showAlert(`Failed to prepare cart: ${msg}`, "error");
      }
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
      if (isSwiggyReauthError(err)) {
        refreshAuth(); // stale token was purged server-side — reflect "not connected" immediately, not just show a message
        showAlert(SWIGGY_REAUTH_MESSAGE, "warning");
      } else {
        showAlert(`Failed to apply coupon: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
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
        if (isSwiggyReauthError(err)) {
          refreshAuth(); // stale token was purged server-side — reflect "not connected" immediately, not just show a message
        showAlert(SWIGGY_REAUTH_MESSAGE, "warning");
        } else {
          showAlert(`Confirmation failed: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
        setCheckoutConfirmed(false);
      }
    }
  };

  const handlePlaceOrder = async () => {
    if (!checkoutConfirmed) return;
    setOrderPlacing(true);
    try {
      const res = await api.placeOrder(activeSessionId, true);
      // The order itself is genuinely placed at this point regardless of
      // what follows — never fabricate a plausible-looking ID when Swiggy's
      // response doesn't include one; fall back to an honest sentinel the
      // UI renders as "Order Confirmed" instead of a fake tracking number.
      const realOrderId = res.order_res?.orderId || res.order_id;
      setPlacedOrderId(realOrderId || CONFIRMED_NO_ID_SENTINEL);
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
      if (isSwiggyReauthError(err)) {
        refreshAuth(); // stale token was purged server-side — reflect "not connected" immediately, not just show a message
        showAlert(SWIGGY_REAUTH_MESSAGE, "warning");
      } else {
        showAlert(`Checkout failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
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
      // updatedProfile comes from OnboardingWizard/OnboardingPanel, neither of
      // which tracks priorityWeights themselves — merge in the live value
      // from this context so a PUT here (which replaces the whole profile
      // row) doesn't silently wipe whatever the Ranking step/Preferences
      // sliders currently hold.
      await api.updateProfile({ ...updatedProfile, priority_weights: priorityWeights });
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
    setNoResultsMessage(null);
    try {
      const res = await api.searchRecommendations(activeSessionId, searchQuery, priorityWeights, patch);
      setSessionStatus(res.status);
      const candidates = res.results.recommendations || [];
      setRecommendations(mapCandidates(candidates));
      setRelaxationOptions(res.results.relaxation_options || []);
      setNoResultsMessage(candidates.length === 0 ? res.results.message || null : null);
      setSelectedMeal(null);
      setCartPreview(null);
    } catch (err) {
      if (isSwiggyReauthError(err)) {
        refreshAuth(); // stale token was purged server-side — reflect "not connected" immediately, not just show a message
        showAlert(SWIGGY_REAUTH_MESSAGE, "warning");
      } else {
        showAlert(`Constraint relaxation search failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
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

  return (
    <NutriOrderContext.Provider
      value={{
        fitnessGoal,
        setFitnessGoal,
        proteinTarget,
        setProteinTarget,
        calorieTarget,
        setCalorieTarget,
        allergies,
        dislikes,
        favCuisines,
        dietPreference,
        profile,
        editingProfile,
        setEditingProfile,
        profileFetching,
        authLoading,
        addresses,
        selectedAddress,
        activeSessionId,
        sessionStatus,
        searchQuery,
        setSearchQuery,
        searchLoading,
        recommendations,
        selectedMeal,
        cartPreview,
        cartLoading,
        checkoutConfirmed,
        orderPlacing,
        placedOrderId,
        trackingStep,
        applicableCoupons,
        couponsLoading,
        appliedCoupon,
        relaxationOptions,
        noResultsMessage,
        showFeedbackModal,
        setShowFeedbackModal,
        feedbackLoading,
        priorityWeights,
        setPriorityWeights,
        coachDashboardRef,
        syncProfileChange,
        handleAddressSelect,
        handleQuerySearch,
        handleMealSelect,
        handleApplyCoupon,
        handleConfirmCheckbox,
        handlePlaceOrder,
        handleFeedbackSubmit,
        handleOnboardingSave,
        handleRelaxationApply,
        handleReset,
        handleAllergyToggle,
      }}
    >
      {children}
    </NutriOrderContext.Provider>
  );
}

export function useNutriOrder() {
  const ctx = useContext(NutriOrderContext);
  if (!ctx) throw new Error("useNutriOrder must be used within a NutriOrderProvider");
  return ctx;
}
