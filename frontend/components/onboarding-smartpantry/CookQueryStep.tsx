import React, { useState } from "react";
import { api, KitchenResolveResponse, RecipeSuggestion } from "../../lib/api";

interface CookQueryStepProps {
  onAddGrocery: (item: { item_name: string; quantity: number; unit: string }) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

const PROMPTS = ["butter chicken tonight", "maggi noodles", "something quick with what I have", "veg dinner for the family"];

function CoverageBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${pct >= 100 ? "bg-success" : pct >= 50 ? "bg-pantry" : "bg-warning"}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function CookQueryStep({ onAddGrocery, onNext, onBack }: CookQueryStepProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KitchenResolveResponse | null>(null);
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api.resolveKitchenQuery(trimmed);
      setResult(res);
    } catch (err) {
      alert("Couldn't resolve that: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const addMissing = async (recipe: RecipeSuggestion) => {
    setAdding(true);
    try {
      for (const item of recipe.missing_items) {
        await onAddGrocery({ item_name: item.name, quantity: 1, unit: "unit" });
      }
    } catch (err) {
      alert("Failed to add items: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAdding(false);
    }
  };

  const addAllParsed = async () => {
    if (!result?.grocery_item_names) return;
    setAdding(true);
    try {
      for (const name of result.grocery_item_names) {
        await onAddGrocery({ item_name: name, quantity: 1, unit: "unit" });
      }
    } catch (err) {
      alert("Failed to add items: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="bg-surface border border-border p-8 rounded-2xl shadow-xl w-full flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-xl font-bold text-text">What&apos;s on your mind to cook?</h3>
        <p className="text-xs text-muted mt-1">Name a dish and we&apos;ll check it against what you just stocked — buy the gap on Instamart, right now or later.</p>
      </div>

      <div className="flex flex-col gap-3">
        <textarea
          rows={2}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. butter chicken, maggi noodles, veg dinner for the family"
          className="w-full bg-surface-2 border border-border focus:border-pantry rounded-xl p-3 text-sm text-text placeholder:text-subtle focus:outline-none transition resize-none font-sans"
        />
        <div className="flex flex-wrap gap-1.5">
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setQuery(p)}
              className="text-[10px] bg-surface-2 border border-border text-subtle hover:text-muted hover:border-border-strong px-2 py-1 rounded transition"
            >
              💡 {p}
            </button>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={loading || !query.trim()}
          className="w-full bg-pantry hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed text-pantry-contrast font-bold py-2.5 rounded-xl transition text-sm"
        >
          {loading ? "Checking your pantry…" : "Check it"}
        </button>
      </div>

      {result && (
        <div className="flex flex-col gap-3">
          {result.intent === "recipe" && result.recipe && "coverage_pct" in result.recipe && (
            <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-text">{result.recipe.name}</h4>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${result.recipe.can_cook_now ? "bg-success/10 text-success border-success/20" : "bg-pantry/10 text-pantry border-pantry/20"}`}>
                  {result.recipe.can_cook_now ? "Ready to cook" : `${result.recipe.coverage_pct}% in stock`}
                </span>
              </div>
              <CoverageBar pct={result.recipe.coverage_pct} />
              {result.recipe.missing_items.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-subtle">Missing: {result.recipe.missing_items.map((m) => m.name).join(", ")}</p>
                  <button
                    onClick={() => addMissing(result.recipe as RecipeSuggestion)}
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
          )}

          {result.intent === "recipe_conflict" && result.recipe && "reason" in result.recipe && (
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-sm">
              <p className="font-bold text-text">{result.recipe.name} isn&apos;t a fit right now</p>
              <p className="text-muted text-xs mt-0.5">{result.recipe.reason}</p>
            </div>
          )}

          {result.intent === "grocery_item" && result.grocery_item_names && (
            <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-3">
              <p className="text-sm font-bold text-text">Add to your grocery list?</p>
              <div className="flex flex-wrap gap-2">
                {result.grocery_item_names.map((name) => (
                  <span key={name} className="text-xs bg-surface border border-border text-text px-2.5 py-1 rounded-full">
                    {name}
                  </span>
                ))}
              </div>
              <button
                onClick={addAllParsed}
                disabled={adding}
                className="self-start bg-pantry hover:brightness-105 disabled:opacity-50 text-pantry-contrast font-bold text-xs px-3 py-2 rounded-lg transition"
              >
                {adding ? "Adding…" : `Add all ${result.grocery_item_names.length} to grocery list`}
              </button>
            </div>
          )}

          {result.intent === "browse" && result.browse_suggestions && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-subtle">No exact match — worth cooking with what you just stocked:</p>
              {result.browse_suggestions.slice(0, 3).map((r) => (
                <div key={r.name} className="bg-surface-2 border border-border rounded-xl p-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-text">{r.name}</span>
                  <span className="text-[10px] text-subtle">{r.coverage_pct}% in stock</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 mt-2">
        <button type="button" onClick={onBack} className="px-5 py-3 rounded-xl border border-border text-text font-semibold text-sm hover:bg-surface-2 transition">
          Back
        </button>
        <button onClick={onNext} className="flex-1 bg-pantry hover:brightness-105 text-pantry-contrast font-bold py-3 rounded-xl transition text-sm shadow-md">
          {result ? "Continue" : "Skip for now"}
        </button>
      </div>
    </div>
  );
}
