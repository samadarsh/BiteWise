"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type AlertType = "success" | "error" | "warning" | "info";

export interface DashboardAlert {
  message: string;
  type: AlertType;
}

interface DashboardContextType {
  /** Monotonic counter bumped after demo seed/reset so mounted product views re-fetch. */
  dataVersion: number;
  refreshData: () => void;

  /** Shared alert surface rendered by the dashboard shell. */
  alert: DashboardAlert | null;
  showAlert: (message: string, type?: AlertType) => void;
  clearAlert: () => void;

  /** Cross-view request (e.g. from the header menu) to open the NutriOrder profile editor. */
  editProfileRequested: boolean;
  requestEditProfile: () => void;
  clearEditProfileRequest: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [dataVersion, setDataVersion] = useState(0);
  const [alert, setAlert] = useState<DashboardAlert | null>(null);
  const [editProfileRequested, setEditProfileRequested] = useState(false);

  const refreshData = useCallback(() => setDataVersion((v) => v + 1), []);
  const showAlert = useCallback((message: string, type: AlertType = "info") => setAlert({ message, type }), []);
  const clearAlert = useCallback(() => setAlert(null), []);
  const requestEditProfile = useCallback(() => setEditProfileRequested(true), []);
  const clearEditProfileRequest = useCallback(() => setEditProfileRequested(false), []);

  return (
    <DashboardContext.Provider
      value={{
        dataVersion,
        refreshData,
        alert,
        showAlert,
        clearAlert,
        editProfileRequested,
        requestEditProfile,
        clearEditProfileRequest,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return ctx;
}
