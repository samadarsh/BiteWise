import React, { useEffect, useState, useCallback } from "react";
import { api, Household, PantryItem, GroceryList } from "../../lib/api";
import HouseholdMembersCard from "./HouseholdMembersCard";
import PantryManager from "./PantryManager";
import GroceryListPanel from "./GroceryListPanel";
import CartPreviewPanel from "./CartPreviewPanel";
import LowStockAlerts from "./LowStockAlerts";
import CookTodayPanel from "./CookTodayPanel";
import NutritionInsightsCard from "./NutritionInsightsCard";

export default function HouseholdDashboard() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [hh, p, gl] = await Promise.all([
        api.getHousehold(),
        api.getPantry(),
        api.getGroceryList()
      ]);
      setHousehold(hh);
      setPantry(p);
      setGroceryList(gl);
    } catch (err) {
      setError("Failed to load household data. Is backend online?");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const handleAddMember = async (member: { name: string; dietary_preference: string; allergies: string[]; calorie_target?: number; protein_target?: number }) => {
    await api.addHouseholdMember(member);
    await loadData();
  };

  const handleDeleteMember = async (id: string) => {
    await api.deleteHouseholdMember(id);
    await loadData();
  };

  const handleAddPantry = async (item: { item_name: string; quantity: number; unit: string; min_threshold?: number }) => {
    await api.addOrUpdatePantryItem(item);
    await loadData();
  };

  const handleDeletePantry = async (id: string) => {
    await api.deletePantryItem(id);
    await loadData();
  };

  const handleAddGrocery = async (item: { item_name: string; quantity: number; unit: string }) => {
    await api.addGroceryItem(item);
    await loadData();
  };

  const handleToggleGrocery = async (id: string, isPurchased: boolean) => {
    await api.updateGroceryItem(id, isPurchased);
    await loadData();
  };

  const handleDeleteGrocery = async (id: string) => {
    await api.deleteGroceryItem(id);
    await loadData();
  };

  const handleMatchRecipe = async (recipe: { recipe_name: string; ingredients: { name: string; qty: number; unit: string }[]; planned_for_date: string }) => {
    const res = await api.matchRecipeIngredients(recipe);
    await loadData();
    return res;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-white gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-500"></div>
        <p className="text-sm font-semibold text-slate-400">Loading Household Assistant...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-sm">
          ⚠️ {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white max-w-7xl mx-auto px-4">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:justify-between md:items-center text-left">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            🏡 Household Assistant
          </h2>
          <p className="text-xs text-slate-400 font-semibold mt-1">
            Manage your shared family diet targets, track pantry stock, discover what to cook, and preview grocery carts.
          </p>
        </div>
        {household && (
          <div className="text-right">
            <span className="inline-block text-xs font-mono font-bold px-3 py-1 bg-slate-800 rounded border border-slate-700 text-emerald-400">
              Household ID: {household.id}
            </span>
          </div>
        )}
      </div>

      {/* Low Stock Alerts Banner (full width) */}
      <LowStockAlerts onRefreshData={loadData} />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Cook Today + Pantry */}
        <div className="lg:col-span-2 space-y-6">
          <CookTodayPanel onPlanRecipe={handleMatchRecipe} />
          <PantryManager
            pantry={pantry}
            onAddOrUpdateItem={handleAddPantry}
            onDeleteItem={handleDeletePantry}
          />
        </div>

        {/* Right Column: Family + Nutrition Insights */}
        <div className="space-y-6">
          <HouseholdMembersCard
            members={household?.members || []}
            onAddMember={handleAddMember}
            onDeleteMember={handleDeleteMember}
          />
          <NutritionInsightsCard />
        </div>
      </div>

      {/* Bottom Row: Grocery List + Cart Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GroceryListPanel
          list={groceryList}
          onAddItem={handleAddGrocery}
          onToggleItem={handleToggleGrocery}
          onDeleteItem={handleDeleteGrocery}
          onMatchRecipe={handleMatchRecipe}
        />
        <CartPreviewPanel
          onGetCartPreview={api.getCartPreview}
        />
      </div>
    </div>
  );
}
