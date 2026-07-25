"use client";

import React, { useState } from "react";
import { api, KitchenResolveResponse, RecipeSuggestion } from "../../../../lib/api";
import { useSmartPantry } from "../../../../lib/smartpantry-context";
import { useDashboard } from "../../../../lib/dashboard-context";
import LowStockAlerts from "../../../../components/household/LowStockAlerts";
import DemoStoryBanner from "../../../../components/DemoStoryBanner";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

const PROMPTS = ["butter chicken tonight", "something quick with what I have", "veg dinner for the family", "chips and coke"];

function CoverageBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${pct >= 100 ? "bg-success" : pct >= 50 ? "bg-pantry" : "bg-warning"}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function RecipeResultCard({ recipe, onAddMissing, adding }: { recipe: RecipeSuggestion; onAddMissing: () => void; adding: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-text">{recipe.name}</h3>
          <p className="text-xs text-subtle mt-0.5">{recipe.tag}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${recipe.can_cook_now ? "bg-success/10 text-success border-success/20" : "bg-pantry/10 text-pantry border-pantry/20"}`}>
          {recipe.can_cook_now ? "Ready to cook" : `${recipe.coverage_pct}% in stock`}
        </span>
      </div>
      <CoverageBar pct={recipe.coverage_pct} />
      {recipe.missing_items.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-subtle">Missing: {recipe.missing_items.map((m) => m.name).join(", ")}</p>
          <button
            onClick={onAddMissing}
            disabled={adding}
            className="self-start bg-pantry hover:brightness-105 disabled:opacity-50 text-pantry-contrast font-bold text-xs px-3 py-2 rounded-lg transition"
          >
            {adding ? "Adding…" : "Add missing to grocery list"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-success font-semibold">Everything&apos;s in stock.</p>
      )}
    </div>
  );
}

export default function SmartPantryKitchenPage() {
  const { handleAddGrocery, loadData } = useSmartPantry();
  const { showAlert } = useDashboard();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KitchenResolveResponse | null>(null);
  const [addingMissing, setAddingMissing] = useState(false);
  const [addingItems, setAddingItems] = useState(false);

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api.resolveKitchenQuery(trimmed);
      setResult(res);
    } catch (err) {
      showAlert(`Couldn't resolve that: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const addMissingToGrocery = async (recipe: RecipeSuggestion) => {
    setAddingMissing(true);
    try {
      for (const item of recipe.missing_items) {
        await handleAddGrocery({ item_name: item.name, quantity: 1, unit: "unit" });
      }
      showAlert(`Added ${recipe.missing_items.length} item(s) to your grocery list.`, "success");
    } catch (err) {
      showAlert(`Failed to add items: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setAddingMissing(false);
    }
  };

  const addAllParsedItems = async () => {
    if (!result?.grocery_item_names) return;
    setAddingItems(true);
    try {
      for (const name of result.grocery_item_names) {
        await handleAddGrocery({ item_name: name, quantity: 1, unit: "unit" });
      }
      showAlert(`Added ${result.grocery_item_names.length} item(s) to your grocery list.`, "success");
      setResult(null);
      setQuery("");
    } catch (err) {
      showAlert(`Failed to add items: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setAddingItems(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Product hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-surface via-surface to-surface-2 border border-border p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-pantry/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-pantry/15 border border-pantry/30 text-pantry">SmartPantry AI</span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface-3 text-muted border border-border-strong">🏡 Shared Household Intelligence</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-text">
            Pantry, Recipe &amp; <span className="text-pantry">Grocery Intelligence</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-2 max-w-2xl leading-relaxed">
            Track household ingredient inventory, auto-match recipes to available stock, detect dietary conflicts, and build grouped grocery lists.
          </p>
        </div>
      </div>

      <DemoStoryBanner context="household_populated" />

      <div className="max-w-3xl w-full mx-auto flex flex-col gap-5">
        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-text">What do you want to cook — or need to order?</h2>
          <p className="text-xs sm:text-sm text-subtle mt-1.5">Name a dish, describe a craving, or just list what you need.</p>
        </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(query);
        }}
        className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm"
      >
        <textarea
          rows={2}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. butter chicken tonight, or chips and coke"
          className="w-full bg-surface-2 border border-border focus:border-pantry rounded-xl p-3 text-sm text-text placeholder:text-subtle focus:outline-none transition resize-none font-sans"
        />
        <div className="flex flex-wrap gap-1.5">
          {PROMPTS.map((p) => (
            <button key={p} type="button" onClick={() => setQuery(p)} className="text-[10px] bg-surface-2 border border-border text-subtle hover:text-muted hover:border-border-strong px-2 py-1 rounded transition">
              💡 {p}
            </button>
          ))}
        </div>
        <button type="submit" disabled={loading || !query.trim()} className="w-full bg-pantry hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed text-pantry-contrast font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2 shadow-md">
          {loading ? (
            <>
              <Spinner className="h-4 w-4 text-pantry-contrast" />
              Thinking…
            </>
          ) : (
            "Go"
          )}
        </button>
      </form>

      {result && (
        <div className="flex flex-col gap-3">
          {result.intent === "recipe" && result.recipe && "coverage_pct" in result.recipe && (
            <RecipeResultCard recipe={result.recipe} onAddMissing={() => addMissingToGrocery(result.recipe as RecipeSuggestion)} adding={addingMissing} />
          )}

          {result.intent === "recipe_conflict" && result.recipe && "reason" in result.recipe && (
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-start gap-2.5 text-sm">
              <span className="text-warning">⚠️</span>
              <div>
                <p className="font-bold text-text">{result.recipe.name} isn&apos;t a fit right now</p>
                <p className="text-muted text-xs mt-0.5">{result.recipe.reason}</p>
              </div>
            </div>
          )}

          {result.intent === "browse" && result.browse_suggestions && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-subtle">No exact match — here&apos;s what&apos;s worth cooking with what you have:</p>
              {result.browse_suggestions.map((r) => (
                <RecipeResultCard key={r.name} recipe={r} onAddMissing={() => addMissingToGrocery(r)} adding={addingMissing} />
              ))}
            </div>
          )}

          {result.intent === "grocery_item" && result.grocery_item_names && (
            <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-3">
              <p className="text-sm font-bold text-text">Add to your grocery list?</p>
              <div className="flex flex-wrap gap-2">
                {result.grocery_item_names.map((name) => (
                  <span key={name} className="text-xs bg-surface-2 border border-border text-text px-2.5 py-1 rounded-full">
                    {name}
                  </span>
                ))}
              </div>
              <button
                onClick={addAllParsedItems}
                disabled={addingItems}
                className="self-start bg-pantry hover:brightness-105 disabled:opacity-50 text-pantry-contrast font-bold text-xs px-3 py-2 rounded-lg transition"
              >
                {addingItems ? "Adding…" : `Add all ${result.grocery_item_names.length} to grocery list`}
              </button>
            </div>
          )}
        </div>
      )}

        <LowStockAlerts onRefreshData={loadData} />
      </div>
    </div>
  );
}
