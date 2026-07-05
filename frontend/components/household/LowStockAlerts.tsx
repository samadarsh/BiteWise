import React, { useState, useEffect, useCallback } from "react";
import { api, LowStockResponse, LowStockAlert } from "../../lib/api";

interface LowStockAlertsProps {
  onRefreshData: () => void;
}

export default function LowStockAlerts({ onRefreshData }: LowStockAlertsProps) {
  const [data, setData] = useState<LowStockResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await api.getLowStockAlerts();
      setData(res);
    } catch {
      // Silently ignore — dashboard still works without this
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAlerts();
  }, [loadAlerts]);

  if (loading || !data || data.total_alerts === 0) return null;

  const severityIcon = (severity: string) =>
    severity === "out_of_stock" ? "🔴" : "🟡";

  const severityClass = (severity: string) =>
    severity === "out_of_stock"
      ? "border-rose-500/30 bg-rose-500/5"
      : "border-amber-500/30 bg-amber-500/5";

  return (
    <div className="bg-gradient-to-r from-rose-950/40 via-amber-950/30 to-slate-900/60 backdrop-blur-md border border-rose-500/20 rounded-2xl p-4 shadow-xl">
      {/* Header Bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="text-lg">⚠️</span>
            <span className="absolute -top-1 -right-2 h-4 w-4 rounded-full bg-rose-500 text-[9px] font-black text-white flex items-center justify-center animate-pulse">
              {data.total_alerts}
            </span>
          </div>
          <div>
            <span className="text-sm font-bold text-white">
              {data.out_of_stock_count > 0
                ? `${data.out_of_stock_count} out of stock`
                : ""}
              {data.out_of_stock_count > 0 && data.low_stock_count > 0 && ", "}
              {data.low_stock_count > 0
                ? `${data.low_stock_count} running low`
                : ""}
            </span>
            {data.auto_added_to_grocery.length > 0 && (
              <span className="ml-2 text-[10px] font-semibold text-emerald-400">
                ✓ {data.auto_added_to_grocery.length} auto-added to grocery list
              </span>
            )}
          </div>
        </div>
        <span className="text-slate-500 text-xs font-semibold">
          {expanded ? "▲ Collapse" : "▼ Expand"}
        </span>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.alerts.map((alert: LowStockAlert) => (
            <div
              key={alert.item_name}
              className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${severityClass(alert.severity)}`}
            >
              <div className="flex items-center gap-2">
                <span>{severityIcon(alert.severity)}</span>
                <span className="font-bold text-white">{alert.item_name}</span>
              </div>
              <div className="text-right text-slate-400">
                <span className="font-mono">
                  {alert.current_qty}/{alert.min_threshold} {alert.unit}
                </span>
                <span className="block text-[9px] uppercase font-bold mt-0.5">
                  {alert.severity === "out_of_stock" ? (
                    <span className="text-rose-400">OUT OF STOCK</span>
                  ) : (
                    <span className="text-amber-400">LOW</span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-added notification */}
      {expanded && data.auto_added_to_grocery.length > 0 && (
        <div className="mt-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-semibold">
          ✅ Auto-restocked to grocery list: {data.auto_added_to_grocery.join(", ")}
          <button
            onClick={() => {
              onRefreshData();
              loadAlerts();
            }}
            className="ml-2 underline hover:text-emerald-300 transition"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
