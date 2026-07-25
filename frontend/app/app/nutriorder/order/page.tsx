"use client";

import React from "react";
import { useNutriOrder } from "../../../../lib/nutriorder-context";
import PriorityControls from "../../../../components/PriorityControls";
import RecommendationCard from "../../../../components/RecommendationCard";
import RelaxationOptions from "../../../../components/RelaxationOptions";
import DemoStoryBanner from "../../../../components/DemoStoryBanner";
import LoadingSkeleton from "../../../../components/LoadingSkeleton";
import { SwiggyConnectionCard } from "../../../../components/SwiggyConnectionCard";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export default function NutriOrderOrderPage() {
  const {
    addresses,
    selectedAddress,
    sessionStatus,
    handleAddressSelect,
    fitnessGoal,
    setFitnessGoal,
    proteinTarget,
    setProteinTarget,
    calorieTarget,
    setCalorieTarget,
    allergies,
    profile,
    syncProfileChange,
    handleAllergyToggle,
    setEditingProfile,
    searchQuery,
    setSearchQuery,
    searchLoading,
    handleQuerySearch,
    priorityWeights,
    setPriorityWeights,
    relaxationOptions,
    handleRelaxationApply,
    recommendations,
    selectedMeal,
    handleMealSelect,
    cartLoading,
    cartPreview,
    checkoutConfirmed,
    handleConfirmCheckbox,
    applicableCoupons,
    couponsLoading,
    appliedCoupon,
    handleApplyCoupon,
    orderPlacing,
    handlePlaceOrder,
    placedOrderId,
  } = useNutriOrder();

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
        <div className="xl:col-span-6 flex flex-col gap-4 sm:gap-8">
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

        {/* Right Column: Recommendations & Checkout */}
        <div className="xl:col-span-6 flex flex-col gap-8">
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
      </main>
    </>
  );
}
