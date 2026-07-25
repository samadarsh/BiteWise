"use client";

import { useState } from "react";
import { NutriOrderShowcase } from "./NutriOrderShowcase";
import { SmartPantryShowcase } from "./SmartPantryShowcase";

export function ProductPreviewTabs() {
  const [selectedProduct, setSelectedProduct] = useState<"nutriorder" | "smartpantry">("nutriorder");

  return (
    <div className="space-y-6">
      {/* Interactive Switcher */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-1.5 bg-surface-2 border border-border-strong p-1.5 rounded-2xl shadow-lg">
          <button
            type="button"
            onClick={() => setSelectedProduct("nutriorder")}
            className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
              selectedProduct === "nutriorder"
                ? "bg-nutri text-nutri-contrast shadow-md"
                : "text-muted hover:text-text hover:bg-surface"
            }`}
          >
            <span>🥗</span> NutriOrder AI Live Showcase
          </button>

          <button
            type="button"
            onClick={() => setSelectedProduct("smartpantry")}
            className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
              selectedProduct === "smartpantry"
                ? "bg-pantry text-pantry-contrast shadow-md"
                : "text-muted hover:text-text hover:bg-surface"
            }`}
          >
            <span>🏡</span> SmartPantry AI Live Showcase
          </button>
        </div>
      </div>

      {/* Render Selected Product Interactive Showcase */}
      <div>
        {selectedProduct === "nutriorder" ? <NutriOrderShowcase /> : <SmartPantryShowcase />}
      </div>
    </div>
  );
}
