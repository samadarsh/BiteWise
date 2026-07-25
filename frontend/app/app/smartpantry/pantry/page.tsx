"use client";

import React from "react";
import { useSmartPantry } from "../../../../lib/smartpantry-context";
import PantryManager from "../../../../components/household/PantryManager";

export default function SmartPantryPantryPage() {
  const { pantry, handleAddPantry, handleDeletePantry, handleQuickStock } = useSmartPantry();

  return (
    <div className="max-w-3xl w-full mx-auto">
      <PantryManager pantry={pantry} onAddOrUpdateItem={handleAddPantry} onDeleteItem={handleDeletePantry} onQuickStock={handleQuickStock} />
    </div>
  );
}
