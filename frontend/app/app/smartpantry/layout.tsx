"use client";

import React from "react";
import { SmartPantryProvider, useSmartPantry } from "../../../lib/smartpantry-context";

function SmartPantryGate({ children }: { children: React.ReactNode }) {
  const { loading, error } = useSmartPantry();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border-strong border-t-pantry"></div>
        <p className="text-sm font-semibold text-muted">Loading SmartPantry AI...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <div className="p-4 rounded-xl border border-danger/30 bg-danger/10 text-danger text-sm">⚠️ {error}</div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function SmartPantryLayout({ children }: { children: React.ReactNode }) {
  return (
    <SmartPantryProvider>
      <SmartPantryGate>{children}</SmartPantryGate>
    </SmartPantryProvider>
  );
}
