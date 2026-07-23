'use client';

import React, { useState } from "react";
import { UserProfile, Address, RecommendationMeal, CartInfo, Coupon } from "../../lib/api";
import PriorityControls, { PriorityWeights } from "../PriorityControls";
import RecommendationCard from "../RecommendationCard";
import RelaxationOptions, { RelaxationOption } from "../RelaxationOptions";
import CoachDashboard from "../CoachDashboard";

interface NutriOrderViewProps {
  profile: UserProfile | null;
  addresses: Address[];
  selectedAddress: string;
  onSelectAddress: (addrId: string) => void;
  activeSessionId: string;
  sessionStatus: string;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchLoading: boolean;
  onSearch: (e?: React.FormEvent) => void;
  recommendations: RecommendationMeal[];
  selectedMeal: RecommendationMeal | null;
  onMealSelect: (meal: RecommendationMeal) => void;
  cartPreview: CartInfo | null;
  cartLoading: boolean;
  checkoutConfirmed: boolean;
  onConfirmCheckbox: (checked: boolean) => void;
  orderPlacing: boolean;
  onPlaceOrder: () => void;
  placedOrderId: string;
  trackingStep: number;
  applicableCoupons: Coupon[];
  couponsLoading: boolean;
  appliedCoupon: string;
  onApplyCoupon: (code: string) => void;
  relaxationOptions: RelaxationOption[];
  onApplyRelaxation: (patch: Record<string, unknown>) => void;
  priorityWeights: PriorityWeights;
  onPriorityChange: (weights: PriorityWeights) => void;
  onEditProfile: () => void;
  alertMessage: string;
  alertType: "success" | "error" | "warning" | "info";
  isSwiggyConnected: boolean;
  onConnectSwiggy: () => void;
}

export default function NutriOrderView({
  profile,
  addresses,
  selectedAddress,
  onSelectAddress,
  sessionStatus,
  searchQuery,
  onSearchQueryChange,
  searchLoading,
  onSearch,
  recommendations,
  selectedMeal,
  onMealSelect,
  cartPreview,
  cartLoading,
  checkoutConfirmed,
  onConfirmCheckbox,
  orderPlacing,
  onPlaceOrder,
  placedOrderId,
  trackingStep,
  applicableCoupons,
  couponsLoading,
  appliedCoupon,
  onApplyCoupon,
  relaxationOptions,
  onApplyRelaxation,
  priorityWeights,
  onPriorityChange,
  onEditProfile,
  alertMessage,
  alertType,
  isSwiggyConnected,
  onConnectSwiggy
}: NutriOrderViewProps) {
  const [showCoach, setShowCoach] = useState(false);

  const goalColors: Record<string, string> = {
    weight_loss: "from-amber-500 to-orange-500 text-amber-950",
    muscle_gain: "from-emerald-400 to-teal-400 text-emerald-950",
    maintenance: "from-blue-400 to-indigo-400 text-blue-950",
  };

  const currentGoalStyle = goalColors[profile?.fitness_goal || "maintenance"] || "from-emerald-400 to-teal-400 text-emerald-950";

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 text-slate-100 animate-fade-in pb-16">
      
      {/* Alert Banner */}
      {alertMessage && (
        <div
          className={`p-4 rounded-xl border backdrop-blur-md flex items-center justify-between text-sm shadow-lg ${
            alertType === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : alertType === "error"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
              : alertType === "warning"
              ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
              : "bg-blue-500/10 border-blue-500/30 text-blue-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{alertType === "success" ? "✅" : alertType === "error" ? "⚠️" : "ℹ️"}</span>
            <p>{alertMessage}</p>
          </div>
        </div>
      )}

      {/* Hero Product Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                NutriOrder AI
              </span>
              {isSwiggyConnected ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span>✓</span> Swiggy Connected
                </span>
              ) : (
                <button
                  onClick={onConnectSwiggy}
                  className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition"
                >
                  🔗 Connect Swiggy
                </button>
              )}
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Health-Aware <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-lime-300 bg-clip-text text-transparent">AI Meal Ordering</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
              Order meals matched precisely to your daily calorie allowance, macro targets, and dietary rules with real-time constraint optimization.
            </p>
          </div>

          {/* User Biometric Progress Summary */}
          {profile && (
            <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl shadow-inner min-w-[260px] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Target Goal</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gradient-to-r ${currentGoalStyle}`}>
                  {profile.fitness_goal.replace("_", " ")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center pt-1 border-t border-slate-900">
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Calories</span>
                  <span className="text-lg font-black text-amber-400">{profile.calorie_target} <span className="text-xs font-normal">kcal</span></span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">Protein</span>
                  <span className="text-lg font-black text-emerald-400">{profile.protein_target} <span className="text-xs font-normal">g</span></span>
                </div>
              </div>
              <button
                onClick={onEditProfile}
                className="w-full text-center text-xs text-slate-400 hover:text-emerald-400 font-semibold transition pt-1"
              >
                ✏️ Edit Biometrics ({profile.height_cm}cm, {profile.weight_kg}kg)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Search & Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Search & Priority Controls */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* AI Search Bar */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <span>🔍</span> AI Search Engine
              </h3>
              <button
                onClick={() => setShowCoach(!showCoach)}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline transition"
              >
                {showCoach ? "Hide Coach" : "AI Coach Log"}
              </button>
            </div>

            <form onSubmit={onSearch} className="flex flex-col gap-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder="e.g. High protein chicken bowl under ₹350"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
                />
              </div>

              {/* Delivery Address Selector */}
              {addresses.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Delivery Address</label>
                  <select
                    value={selectedAddress}
                    onChange={(e) => onSelectAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="">Select Address</option>
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} — {a.display_text}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={searchLoading}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-3 rounded-xl shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {searchLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Searching Meals...</span>
                  </>
                ) : (
                  <span>Match Healthy Meals</span>
                )}
              </button>
            </form>
          </div>

          {/* Interactive Priority Weights */}
          <PriorityControls weights={priorityWeights} onChange={onPriorityChange} />

          {/* AI Coach Dashboard Expandable */}
          {showCoach && <CoachDashboard />}
        </div>

        {/* Right Column: Recommendations & Checkout Flow */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Smart Constraint Relaxation Options */}
          {relaxationOptions.length > 0 && (
            <RelaxationOptions options={relaxationOptions} onApply={onApplyRelaxation} />
          )}

          {/* Recommendations Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>🥗</span> Recommended Meals ({recommendations.length})
              </h3>
              {sessionStatus !== "START" && (
                <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-emerald-400">
                  Status: {sessionStatus}
                </span>
              )}
            </div>

            {recommendations.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
                <div className="text-4xl">🍲</div>
                <h4 className="text-base font-bold text-slate-300">Ready to Match Meals</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Use the AI Search Engine on the left to discover high-protein, calorie-matched meals available for instant ordering.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendations.map((meal) => (
                  <RecommendationCard
                    key={meal.id}
                    meal={meal}
                    isSelected={selectedMeal?.id === meal.id}
                    onSelect={onMealSelect}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Selected Meal Cart Preview & Checkout */}
          {selectedMeal && cartPreview && (
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 p-6 rounded-2xl shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                    Active Cart Preview
                  </span>
                  <h4 className="text-lg font-bold text-white mt-1">{cartPreview.restaurantName || selectedMeal.restaurant}</h4>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Total Bill</span>
                  <span className="text-xl font-black text-emerald-400">₹{cartPreview.bill?.total || cartPreview.total || selectedMeal.price}</span>
                </div>
              </div>

              {/* Coupons Picker */}
              {applicableCoupons.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 block">Available Swiggy Coupons</label>
                  <div className="flex flex-wrap gap-2">
                    {applicableCoupons.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => onApplyCoupon(c.code)}
                        disabled={appliedCoupon === c.code || couponsLoading}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition ${
                          appliedCoupon === c.code
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                            : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        🏷️ {c.code} (-₹{c.discount_amount})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Checkout Confirmation Checkbox */}
              <div className="flex items-center gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  id="checkout-confirm"
                  checked={checkoutConfirmed}
                  onChange={(e) => onConfirmCheckbox(e.target.checked)}
                  className="h-4 w-4 rounded accent-emerald-500 bg-slate-900 border-slate-700"
                />
                <label htmlFor="checkout-confirm" className="text-xs text-slate-300 cursor-pointer font-medium">
                  I review and approve this order total & macro targets.
                </label>
              </div>

              {/* Place Order Button */}
              <button
                onClick={onPlaceOrder}
                disabled={!checkoutConfirmed || orderPlacing || cartLoading}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black py-4 rounded-xl shadow-xl transition disabled:opacity-50 flex items-center justify-center gap-2 text-base"
              >
                {orderPlacing ? (
                  <span>Dispatching Order...</span>
                ) : (
                  <span>🚀 Place Swiggy Order (₹{cartPreview.bill?.total || cartPreview.total || selectedMeal.price})</span>
                )}
              </button>
            </div>
          )}

          {/* Order Live Tracking Simulator */}
          {placedOrderId && (
            <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-bold text-white">Order #{placedOrderId} Dispatched</h4>
                  <p className="text-xs text-slate-400 font-mono">Simulating real-time Swiggy driver dispatch...</p>
                </div>
                <span className="text-xl font-bold text-emerald-400">ETA {selectedMeal?.eta || "25 mins"}</span>
              </div>

              {/* Progress Stepper */}
              <div className="grid grid-cols-4 gap-2 pt-2">
                {["Confirmed", "Preparing", "Out for Delivery", "Delivered"].map((stepLabel, idx) => (
                  <div
                    key={stepLabel}
                    className={`p-2 rounded-lg border text-center text-[10px] font-bold uppercase transition ${
                      trackingStep >= idx
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                        : "bg-slate-950 border-slate-800 text-slate-600"
                    }`}
                  >
                    {stepLabel}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
