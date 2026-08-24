"use client";

import React, { useEffect, useState } from "react";
import { api, OrderSessionSummary } from "../../../../lib/api";
import { useDashboard } from "../../../../lib/dashboard-context";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

const STATUS_STYLES: Record<string, string> = {
  ORDER_PLACED: "bg-success/10 text-success border-success/20",
  TRACKING: "bg-success/10 text-success border-success/20",
  FAILED: "bg-danger/10 text-danger border-danger/20",
  USER_CONFIRMED: "bg-nutri/10 text-nutri border-nutri/20",
  ORDER_PLACING: "bg-nutri/10 text-nutri border-nutri/20",
};

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export default function NutriOrderOrdersPage() {
  const { dataVersion } = useDashboard();
  const [sessions, setSessions] = useState<OrderSessionSummary[] | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.getOrderSessions();
        if (!cancelled) setSessions(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  return (
    <main className="max-w-3xl w-full mx-auto flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-text">Order History</h2>
        <p className="text-xs text-subtle mt-1">Every order session you&apos;ve started, most recent first.</p>
      </div>

      {sessions === null && !error ? (
        <div className="flex items-center justify-center py-16 gap-2">
          <Spinner className="h-5 w-5 text-nutri" />
          <span className="text-xs text-subtle font-mono">Loading order history…</span>
        </div>
      ) : error ? (
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 text-sm text-danger">Failed to load order history: {error}</div>
      ) : sessions!.length === 0 ? (
        <div className="border border-dashed border-border-strong rounded-xl flex flex-col items-center justify-center p-10 text-center text-subtle gap-2">
          <span className="text-3xl">🧾</span>
          <p className="text-sm">No orders yet. Once you place an order, it&apos;ll show up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sessions!.map((s) => (
            <div key={s.session_id} className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-text text-sm truncate">{s.meal_name || "In-progress session"}</p>
                  <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${STATUS_STYLES[s.status] || "bg-surface-2 text-subtle border-border"}`}>
                    {statusLabel(s.status)}
                  </span>
                  {s.mcp_mode && (
                    <span
                      title={s.mcp_mode === "mock" ? "Placed with demo data, not a real Swiggy order" : "Placed against your real Swiggy account"}
                      className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                        s.mcp_mode === "mock" ? "bg-warning/10 text-warning border-warning/20" : "bg-info/10 text-info border-info/20"
                      }`}
                    >
                      {s.mcp_mode}
                    </span>
                  )}
                </div>
                <p className="text-xs text-subtle truncate mt-0.5">
                  {s.restaurant_name || "No restaurant selected"} · {new Date(s.created_at).toLocaleString()}
                </p>
              </div>
              {s.total != null && <p className="shrink-0 font-bold text-nutri text-sm">Rs {s.total}</p>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
