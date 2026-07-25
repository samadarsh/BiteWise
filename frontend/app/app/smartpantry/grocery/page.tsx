"use client";

import React from "react";
import { api } from "../../../../lib/api";
import { useSmartPantry } from "../../../../lib/smartpantry-context";
import GroceryListPanel from "../../../../components/household/GroceryListPanel";
import CartPreviewPanel from "../../../../components/household/CartPreviewPanel";

export default function SmartPantryGroceryPage() {
  const { groceryList, handleAddGrocery, handleToggleGrocery, handleDeleteGrocery, handleMatchRecipe, loadData } = useSmartPantry();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 max-w-5xl w-full mx-auto">
      <GroceryListPanel
        list={groceryList}
        onAddItem={handleAddGrocery}
        onToggleItem={handleToggleGrocery}
        onDeleteItem={handleDeleteGrocery}
        onMatchRecipe={handleMatchRecipe}
      />
      <CartPreviewPanel onGetCartPreview={api.getCartPreview} onOrderPlaced={loadData} />
    </div>
  );
}
