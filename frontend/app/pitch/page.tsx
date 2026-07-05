'use client';

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import PitchStepCard from "../../components/PitchStepCard";
import {
  api,
  LowStockResponse,
  CookTodayResponse,
  HouseholdInsightsResponse,
  GroupedGroceryResponse,
  UserProfile,
} from "../../lib/api";

// ── Static fallback data for offline/staging mode ──────────

const FALLBACK_PROFILE = {
  fitness_goal: "muscle_gain",
  calorie_target: 2200,
  protein_target: 120,
  allergies: ["peanuts"],
  diet_preference: "any",
};

const FALLBACK_RECOMMENDATIONS = [
  { name: "Grilled Chicken Bowl", restaurant: "FreshBowl Co.", calories: 520, protein: 42, score: 94, confidence: 0.92 },
  { name: "Paneer Tikka Wrap", restaurant: "WrapStation", calories: 480, protein: 28, score: 86, confidence: 0.88 },
  { name: "Egg White Omelette + Toast", restaurant: "Morning Bytes", calories: 380, protein: 35, score: 82, confidence: 0.85 },
];

const FALLBACK_LOW_STOCK = {
  alerts: [
    { item_name: "Milk", current_qty: 1.0, unit: "L", min_threshold: 2.0, deficit: 1.0, severity: "low" as const },
    { item_name: "Rice", current_qty: 0.0, unit: "kg", min_threshold: 1.0, deficit: 1.0, severity: "out_of_stock" as const },
    { item_name: "Curd", current_qty: 0.5, unit: "kg", min_threshold: 1.0, deficit: 0.5, severity: "low" as const },
  ],
  total_alerts: 3, out_of_stock_count: 1, low_stock_count: 2, auto_added_to_grocery: ["Rice"],
};

const FALLBACK_COOK_TODAY = {
  suggestions: [
    { name: "Dal Tadka", tag: "Quick dinner from pantry", diet: "veg", coverage_pct: 75.0, total_ingredients: 4, matched_ingredients: 3, missing_items: [{ name: "toor dal", needed: 0.2, have: 0, deficit: 0.2, unit: "kg" }], can_cook_now: false },
    { name: "Curd Rice", tag: "Quick dinner from pantry", diet: "veg", coverage_pct: 33.3, total_ingredients: 3, matched_ingredients: 1, missing_items: [{ name: "rice", needed: 0.2, have: 0, deficit: 0.2, unit: "kg" }, { name: "mustard seeds", needed: 0.01, have: 0, deficit: 0.01, unit: "kg" }], can_cook_now: false },
    { name: "Paneer Butter Masala", tag: "Quick dinner from pantry", diet: "veg", coverage_pct: 40.0, total_ingredients: 5, matched_ingredients: 2, missing_items: [{ name: "paneer", needed: 0.25, have: 0, deficit: 0.25, unit: "kg" }, { name: "butter", needed: 0.05, have: 0, deficit: 0.05, unit: "kg" }, { name: "cream", needed: 0.05, have: 0, deficit: 0.05, unit: "L" }], can_cook_now: false },
  ],
  total_recipes: 5, cookable_now: 0,
  skipped_recipes: [
    { recipe: "Butter Chicken", reason: "Household has vegetarian member(s)" },
    { recipe: "Lemon Rice", reason: "Contains allergen(s): peanuts" },
  ],
};

const FALLBACK_INSIGHTS = {
  total_members: 3,
  total_household_calories: 5400,
  total_household_protein: 200,
  member_breakdown: [
    { id: "1", name: "Primary User", dietary_preference: "any", allergies: [], calorie_target: 2200, protein_target: 100, has_targets: true },
    { id: "2", name: "Jane (Spouse)", dietary_preference: "vegetarian", allergies: ["peanuts"], calorie_target: 1800, protein_target: 60, has_targets: true },
    { id: "3", name: "Tommy (Child)", dietary_preference: "any", allergies: [], calorie_target: 1400, protein_target: 40, has_targets: true },
  ],
  combined_allergies: ["peanuts"],
  dietary_preferences: ["vegetarian"],
  dietary_conflicts: ["Jane (Spouse) follow a vegetarian/vegan diet, while Primary User, Tommy (Child) eat non-veg. Cook separate proteins or choose veg recipes for shared meals."],
};

const FALLBACK_GROUPED = {
  groups: [
    { category: "Eggs & Meat", priority_score: 0, items: [{ id: "1", item_name: "Chicken Breast", quantity: 0.5, unit: "kg", priority: "optional" as const, priority_score: 0, added_at: null }], item_count: 1 },
    { category: "Dairy", priority_score: 3, items: [{ id: "2", item_name: "Paneer", quantity: 0.25, unit: "kg", priority: "optional" as const, priority_score: 0, added_at: null }], item_count: 1 },
    { category: "Staples", priority_score: 3, items: [{ id: "3", item_name: "Rice", quantity: 1.0, unit: "kg", priority: "urgent" as const, priority_score: 3, added_at: null }], item_count: 1 },
  ],
  total_items: 3, high_priority_count: 1,
};

const TOTAL_STEPS = 5;

type PitchMode = "checking" | "live_ready" | "live_active" | "fallback";

export default function PitchPage() {
  const [mode, setMode] = useState<PitchMode>("checking");
  const [currentStep, setCurrentStep] = useState(1);
  const [startingDemo, setStartingDemo] = useState(false);

  // Live data state
  const [liveProfile, setLiveProfile] = useState<UserProfile | null>(null);
  const [liveLowStock, setLiveLowStock] = useState<LowStockResponse | null>(null);
  const [liveCookToday, setLiveCookToday] = useState<CookTodayResponse | null>(null);
  const [liveInsights, setLiveInsights] = useState<HouseholdInsightsResponse | null>(null);
  const [liveGrouped, setLiveGrouped] = useState<GroupedGroceryResponse | null>(null);

  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Check backend + mock mode on mount
  useEffect(() => {
    const checkEnvironment = async () => {
      try {
        await api.getHealth();
        const status = await api.getSwiggyStatus();
        if (status.use_mock_mcp) {
          setMode("live_ready");
        } else {
          setMode("fallback");
        }
      } catch {
        setMode("fallback");
      }
    };
    checkEnvironment();
  }, []);

  const startLiveDemo = useCallback(async () => {
    setStartingDemo(true);
    try {
      await api.demoLogin();
      await api.seedDemo();

      // Load live data
      const [prof, lowStock, cookToday, insights, grouped] = await Promise.all([
        api.getProfile(),
        api.getLowStockAlerts(),
        api.getCookTodaySuggestions(),
        api.getHouseholdInsights(),
        api.getGroupedGroceryList(),
      ]);

      setLiveProfile(prof);
      setLiveLowStock(lowStock);
      setLiveCookToday(cookToday);
      setLiveInsights(insights);
      setLiveGrouped(grouped);
      setMode("live_active");
      setCurrentStep(1);
    } catch (err) {
      console.error("Failed to start live demo:", err);
      setMode("fallback");
    } finally {
      setStartingDemo(false);
    }
  }, []);

  const scrollToStep = (step: number) => {
    setCurrentStep(step);
    stepRefs.current[step - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isLive = mode === "live_active";

  // Resolve data: live or fallback
  const profileData = isLive && liveProfile
    ? { fitness_goal: liveProfile.fitness_goal, calorie_target: liveProfile.calorie_target, protein_target: liveProfile.protein_target, allergies: liveProfile.allergies || [], diet_preference: liveProfile.diet_preference || "any" }
    : FALLBACK_PROFILE;

  const lowStockData = isLive && liveLowStock ? liveLowStock : FALLBACK_LOW_STOCK;
  const cookTodayData = isLive && liveCookToday ? liveCookToday : FALLBACK_COOK_TODAY;
  const insightsData = isLive && liveInsights ? liveInsights : FALLBACK_INSIGHTS;
  const groupedData = isLive && liveGrouped ? liveGrouped : FALLBACK_GROUPED;

  // Helper for severity colors
  const severityBadge = (s: string) =>
    s === "out_of_stock"
      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
      : "bg-amber-500/15 text-amber-400 border-amber-500/30";

  const coverageBarColor = (pct: number) => {
    if (pct >= 100) return "bg-emerald-500";
    if (pct >= 60) return "bg-emerald-500/70";
    if (pct >= 30) return "bg-amber-500/70";
    return "bg-rose-500/50";
  };

  return (
    <main className="min-h-screen bg-[#0e1310] text-white">
      {/* Sticky Progress Bar */}
      <div className="sticky top-0 z-50 bg-[#0e1310]/90 backdrop-blur-md border-b border-white/8">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold text-white/70 hover:text-white transition">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-[#f4b544] text-xs font-black text-[#17211c]">N</span>
            NutriOrder AI
          </Link>

          <div className="flex items-center gap-1">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <button
                key={i}
                onClick={() => scrollToStep(i + 1)}
                className={`h-1.5 rounded-full transition-all ${
                  i + 1 === currentStep
                    ? "w-8 bg-[#f4b544]"
                    : i + 1 < currentStep
                    ? "w-4 bg-[#f4b544]/50"
                    : "w-4 bg-white/15"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            {mode === "fallback" && (
              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
                Preview Mode
              </span>
            )}
            {isLive && (
              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                ● Live Data
              </span>
            )}
            <Link
              href="/app"
              className="text-xs font-bold text-white/50 hover:text-white transition"
            >
              Open App →
            </Link>
          </div>
        </div>
      </div>

      {/* Hero / Mode Selection */}
      {(mode === "checking" || mode === "live_ready") && (
        <section className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
          <div className="mb-5 inline-flex rounded-md border border-[#f4b544]/40 bg-[#f4b544]/14 px-3 py-1 text-xs font-semibold uppercase text-[#ffd98a]">
            Product Walkthrough
          </div>
          <h1 className="text-4xl sm:text-5xl font-black max-w-2xl leading-tight">
            See NutriOrder AI in action
          </h1>
          <p className="mt-4 text-sm text-white/60 max-w-lg leading-relaxed">
            A 5-step walkthrough showing how NutriOrder AI turns health goals and household context into smart meal and grocery decisions.
          </p>

          {mode === "checking" ? (
            <div className="mt-10 flex items-center gap-3 text-sm text-white/40">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#f4b544]" />
              Checking backend availability...
            </div>
          ) : (
            <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
              <button
                onClick={startLiveDemo}
                disabled={startingDemo}
                className="rounded-lg bg-[#f4b544] px-8 py-3.5 text-sm font-black text-[#17211c] shadow-[0_18px_50px_rgba(244,181,68,0.28)] transition hover:bg-[#ffd071] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {startingDemo ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#17211c]/30 border-t-[#17211c]" />
                    Setting up live demo...
                  </>
                ) : (
                  "Start Live Demo"
                )}
              </button>
              <button
                onClick={() => { setMode("fallback"); setCurrentStep(1); }}
                className="text-sm font-semibold text-white/50 hover:text-white/80 transition"
              >
                or view static preview →
              </button>
            </div>
          )}
        </section>
      )}

      {/* Fallback Banner */}
      {mode === "fallback" && currentStep === 1 && (
        <div className="max-w-5xl mx-auto px-4 mt-6">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-xs text-amber-300 font-semibold flex items-center gap-2">
            <span>⚠️</span>
            <span>
              Showing sample data. Start the local backend in mock mode to run the live walkthrough.
            </span>
          </div>
        </div>
      )}

      {/* Steps */}
      {(mode === "live_active" || mode === "fallback") && (
        <>
          {/* Step 1: Health Profile */}
          <div ref={(el) => { stepRefs.current[0] = el; }}>
            <PitchStepCard
              stepNumber={1}
              totalSteps={TOTAL_STEPS}
              title="Set Your Health Goals"
              subtitle="NutriOrder AI starts from your fitness goal, daily calorie and protein targets, allergies, and dietary preferences. Every recommendation is personalized from this foundation."
              onNext={() => scrollToStep(2)}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-slate-900 border border-emerald-500/20">
                  <p className="text-[10px] font-bold uppercase text-emerald-400/70">Fitness Goal</p>
                  <p className="text-lg font-black text-white mt-1 capitalize">{profileData.fitness_goal.replace("_", " ")}</p>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-slate-900 border border-orange-500/20">
                  <p className="text-[10px] font-bold uppercase text-orange-400/70">Daily Calories</p>
                  <p className="text-lg font-black text-white mt-1">{profileData.calorie_target} <span className="text-xs font-semibold text-white/40">kcal</span></p>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-slate-900 border border-blue-500/20">
                  <p className="text-[10px] font-bold uppercase text-blue-400/70">Protein Target</p>
                  <p className="text-lg font-black text-white mt-1">{profileData.protein_target}<span className="text-xs font-semibold text-white/40">g</span></p>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-rose-500/10 to-slate-900 border border-rose-500/20">
                  <p className="text-[10px] font-bold uppercase text-rose-400/70">Allergies</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {profileData.allergies.length > 0 ? profileData.allergies.map((a) => (
                      <span key={a} className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/25 capitalize">{a}</span>
                    )) : (
                      <span className="text-xs text-white/30">None</span>
                    )}
                  </div>
                </div>
              </div>
            </PitchStepCard>
          </div>

          {/* Step 2: Meal Recommendations */}
          <div ref={(el) => { stepRefs.current[1] = el; }}>
            <PitchStepCard
              stepNumber={2}
              totalSteps={TOTAL_STEPS}
              title="Get Smart Meal Recommendations"
              subtitle="The AI queries Swiggy Food MCP for real restaurant availability, ranks options by nutrition fit, cost, delivery time, and taste — then explains why each meal was suggested."
              onPrev={() => scrollToStep(1)}
              onNext={() => scrollToStep(3)}
            >
              <div className="space-y-3">
                {FALLBACK_RECOMMENDATIONS.map((meal, i) => (
                  <div key={meal.name} className={`p-4 rounded-xl border ${i === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/8 bg-white/[0.02]"} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3`}>
                    <div>
                      <div className="flex items-center gap-2">
                        {i === 0 && <span className="text-[9px] font-black text-emerald-400 uppercase">Best Match</span>}
                        <h4 className="text-sm font-bold text-white">{meal.name}</h4>
                      </div>
                      <p className="text-[10px] text-white/40 mt-0.5">{meal.restaurant}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-center">
                        <p className="font-black text-white">{meal.calories}</p>
                        <p className="text-[9px] text-white/40">kcal</p>
                      </div>
                      <div className="text-center">
                        <p className="font-black text-blue-400">{meal.protein}g</p>
                        <p className="text-[9px] text-white/40">protein</p>
                      </div>
                      <div className="text-center">
                        <p className="font-black text-[#f4b544]">{meal.score}</p>
                        <p className="text-[9px] text-white/40">score</p>
                      </div>
                      <div className="text-center">
                        <p className="font-mono text-[10px] text-white/50">{Math.round(meal.confidence * 100)}%</p>
                        <p className="text-[9px] text-white/40">conf.</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </PitchStepCard>
          </div>

          {/* Step 3: Pantry Alerts */}
          <div ref={(el) => { stepRefs.current[2] = el; }}>
            <PitchStepCard
              stepNumber={3}
              totalSteps={TOTAL_STEPS}
              title="Your Pantry Knows What's Low"
              subtitle="The Household Assistant continuously scans pantry stock against restock thresholds. Out-of-stock items are auto-added to the grocery list. Low-stock items get amber alerts."
              onPrev={() => scrollToStep(2)}
              onNext={() => scrollToStep(4)}
            >
              <div className="space-y-4">
                {/* Low Stock Alerts */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {lowStockData.alerts.map((alert) => (
                    <div key={alert.item_name} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs ${severityBadge(alert.severity)}`}>
                      <div className="flex items-center gap-2">
                        <span>{alert.severity === "out_of_stock" ? "🔴" : "🟡"}</span>
                        <span className="font-bold text-white">{alert.item_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-white/60">{alert.current_qty}/{alert.min_threshold} {alert.unit}</span>
                        <span className="block text-[9px] font-black uppercase mt-0.5">
                          {alert.severity === "out_of_stock" ? "OUT OF STOCK" : "LOW"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {lowStockData.auto_added_to_grocery.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/8 border border-emerald-500/20 text-xs text-emerald-400 font-semibold">
                    ✅ Auto-restocked to grocery list: {lowStockData.auto_added_to_grocery.join(", ")}
                  </div>
                )}
                {/* Household Insights Preview */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8">
                    <p className="text-[10px] font-bold uppercase text-white/40">Family Members</p>
                    <p className="text-xl font-black text-white mt-1">{insightsData.total_members}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8">
                    <p className="text-[10px] font-bold uppercase text-white/40">Household Calories</p>
                    <p className="text-xl font-black text-white mt-1">{insightsData.total_household_calories.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8">
                    <p className="text-[10px] font-bold uppercase text-white/40">Allergens</p>
                    <div className="flex gap-1 mt-2">{insightsData.combined_allergies.map((a) => (
                      <span key={a} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/25 capitalize">{a}</span>
                    ))}</div>
                  </div>
                </div>
              </div>
            </PitchStepCard>
          </div>

          {/* Step 4: Cook Today */}
          <div ref={(el) => { stepRefs.current[3] = el; }}>
            <PitchStepCard
              stepNumber={4}
              totalSteps={TOTAL_STEPS}
              title="Cook Something Tonight"
              subtitle="The 'What Can I Cook?' engine matches pantry stock against recipe templates, filters by household dietary constraints, and ranks by ingredient coverage."
              onPrev={() => scrollToStep(3)}
              onNext={() => scrollToStep(5)}
            >
              <div className="space-y-3">
                {cookTodayData.suggestions.slice(0, 3).map((recipe) => (
                  <div key={recipe.name} className={`p-3 rounded-xl border ${recipe.can_cook_now ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/8 bg-white/[0.02]"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{recipe.name}</span>
                        <span className={`px-1.5 py-0.5 text-[9px] font-black uppercase rounded ${recipe.diet === "veg" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"}`}>
                          {recipe.diet}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-white/40">{recipe.tag}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${coverageBarColor(recipe.coverage_pct)}`} style={{ width: `${Math.min(recipe.coverage_pct, 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-white/60 w-12 text-right">{recipe.coverage_pct}%</span>
                    </div>
                    {recipe.missing_items.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {recipe.missing_items.map((mi) => (
                          <span key={mi.name} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {mi.name} ({mi.deficit} {mi.unit})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {cookTodayData.skipped_recipes.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15 text-[10px] text-amber-300/70 space-y-0.5">
                    {cookTodayData.skipped_recipes.map((sr) => (
                      <p key={sr.recipe}><span className="line-through text-white/30">{sr.recipe}</span> — {sr.reason}</p>
                    ))}
                  </div>
                )}
              </div>
            </PitchStepCard>
          </div>

          {/* Step 5: Grocery Cart Preview */}
          <div ref={(el) => { stepRefs.current[4] = el; }}>
            <PitchStepCard
              stepNumber={5}
              totalSteps={TOTAL_STEPS}
              title="Preview Your Grocery Cart"
              subtitle="Unpurchased grocery items are grouped by category with priority scoring. The Instamart preview shows estimated costs without placing any real order."
              onPrev={() => scrollToStep(4)}
              isLast
            >
              <div className="space-y-3">
                {groupedData.high_priority_count > 0 && (
                  <div className="text-[10px] font-bold text-rose-400">
                    🔴 {groupedData.high_priority_count} urgent item{groupedData.high_priority_count > 1 ? "s" : ""} need restocking
                  </div>
                )}
                {groupedData.groups.map((group) => (
                  <div key={group.category} className="border border-white/10 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-white/[0.04]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{group.category}</span>
                        <span className="text-[10px] text-white/40">({group.item_count})</span>
                      </div>
                      {group.priority_score >= 3 ? (
                        <span className="text-[9px] font-black text-rose-400 uppercase px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">🔴 Urgent</span>
                      ) : (
                        <span className="text-[9px] font-black text-white/30 uppercase px-1.5 py-0.5 rounded bg-white/5 border border-white/10">⚪ Optional</span>
                      )}
                    </div>
                    <div className="divide-y divide-white/5">
                      {group.items.map((item) => (
                        <div key={item.id} className={`px-4 py-2 flex justify-between items-center text-xs ${item.priority === "urgent" ? "bg-rose-500/5" : ""}`}>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{item.item_name}</span>
                            <span className="text-white/40">{item.quantity} {item.unit}</span>
                            {item.priority === "urgent" && <span className="text-[8px] font-black text-rose-400">RESTOCK</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </PitchStepCard>
          </div>

          {/* Final CTA */}
          <section className="py-20 text-center px-4">
            <div className="max-w-lg mx-auto">
              <div className="mb-4 inline-flex rounded-md border border-[#f4b544]/40 bg-[#f4b544]/14 px-3 py-1 text-xs font-semibold uppercase text-[#ffd98a]">
                {isLive ? "Live Demo Complete" : "End of Preview"}
              </div>
              <h2 className="text-3xl sm:text-4xl font-black">This is NutriOrder AI.</h2>
              <p className="mt-4 text-sm text-white/60 leading-relaxed">
                Health-aware meal ordering. Smart pantry intelligence. Recipe suggestions that respect your family&apos;s dietary needs. Grocery carts ready for Instamart — without placing a single real order until you say so.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/app"
                  className="rounded-lg bg-[#f4b544] px-8 py-3.5 text-sm font-black text-[#17211c] shadow-[0_18px_50px_rgba(244,181,68,0.28)] transition hover:bg-[#ffd071] inline-block"
                >
                  Open Dashboard
                </Link>
                <Link
                  href="/"
                  className="text-sm font-semibold text-white/50 hover:text-white/80 transition"
                >
                  ← Back to Home
                </Link>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
