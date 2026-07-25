"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, Household, PantryItem, GroceryList } from "./api";

interface SmartPantryContextType {
  household: Household | null;
  pantry: PantryItem[];
  groceryList: GroceryList | null;
  loading: boolean;
  error: string;
  loadData: () => Promise<void>;
  handleAddMember: (member: { name: string; dietary_preference: string; allergies: string[]; calorie_target?: number; protein_target?: number }) => Promise<void>;
  handleDeleteMember: (id: string) => Promise<void>;
  handleAddPantry: (item: { item_name: string; stock_level?: string; category?: string; expiry_date?: string; is_bulk?: boolean }) => Promise<void>;
  handleQuickStock: (items: { item_name: string; category: string; stock_level: string; is_bulk: boolean }[]) => Promise<void>;
  handleDeletePantry: (id: string) => Promise<void>;
  handleAddGrocery: (item: { item_name: string; quantity: number; unit: string }) => Promise<void>;
  handleToggleGrocery: (id: string, isPurchased: boolean) => Promise<void>;
  handleDeleteGrocery: (id: string) => Promise<void>;
  handleMatchRecipe: (recipe: { recipe_name: string; ingredients: { name: string; qty: number; unit: string }[]; planned_for_date: string }) => Promise<Awaited<ReturnType<typeof api.matchRecipeIngredients>>>;
}

const SmartPantryContext = createContext<SmartPantryContextType | undefined>(undefined);

export function SmartPantryProvider({ children }: { children: React.ReactNode }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [hh, p, gl] = await Promise.all([api.getHousehold(), api.getPantry(), api.getGroceryList()]);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial household/pantry/grocery fetch on mount
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

  const handleAddPantry = async (item: { item_name: string; stock_level?: string; category?: string; expiry_date?: string; is_bulk?: boolean }) => {
    await api.addOrUpdatePantryItem(item);
    await loadData();
  };

  const handleQuickStock = async (items: { item_name: string; category: string; stock_level: string; is_bulk: boolean }[]) => {
    await api.quickStockPantry(items);
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
    if (isPurchased) {
      await api.markPurchasedAndRestock([id]);
    } else {
      await api.updateGroceryItem(id, false);
    }
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

  return (
    <SmartPantryContext.Provider
      value={{
        household,
        pantry,
        groceryList,
        loading,
        error,
        loadData,
        handleAddMember,
        handleDeleteMember,
        handleAddPantry,
        handleQuickStock,
        handleDeletePantry,
        handleAddGrocery,
        handleToggleGrocery,
        handleDeleteGrocery,
        handleMatchRecipe,
      }}
    >
      {children}
    </SmartPantryContext.Provider>
  );
}

export function useSmartPantry() {
  const ctx = useContext(SmartPantryContext);
  if (!ctx) throw new Error("useSmartPantry must be used within a SmartPantryProvider");
  return ctx;
}
