import React, { useState, useEffect, useCallback } from "react";
import { api, LowStockResponse, LowStockAlert } from "../../lib/api";

interface LowStockAlertsProps {
  onRefreshData: () => void;
}

interface ExpiringItem {
  id: string;
  item_name: string;
  category: string;
  stock_level: string;
  expiry_date: string;
  days_left: number;
  urgency: "today" | "tomorrow" | "soon";
}

export default function LowStockAlerts({ onRefreshData }: LowStockAlertsProps) {
  const [stockData, setStockData] = useState<LowStockResponse | null>(null);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async () => {
    try {
      const [stockRes, expiringRes] = await Promise.all([
        api.getLowStockAlerts(),
        api.getExpiringItems(3)
      ]);
      setStockData(stockRes);
      setExpiringItems(expiringRes.expiring_items);
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAlerts();
  }, [loadAlerts]);

  const hasAlerts = (stockData && stockData.total_alerts > 0) || expiringItems.length > 0;

  if (loading || !hasAlerts) return null;

  const severityIcon = (severity: string) =>
    severity === "out_of_stock" ? "🔴" : "🟡";

  const severityClass = (severity: string) =>
    severity === "out_of_stock"
      ? "border-rose-500/30 bg-rose-500/5 text-rose-300"
      : "border-amber-500/30 bg-amber-500/5 text-amber-300";

  const urgencyClass = (urgency: string) => {
    if (urgency === "today") return "border-rose-500/30 bg-rose-500/5 text-rose-300";
    if (urgency === "tomorrow") return "border-orange-500/30 bg-orange-500/5 text-orange-300";
    return "border-yellow-500/30 bg-yellow-500/5 text-yellow-300";
  };

  const urgencyIcon = (urgency: string) => {
    if (urgency === "today") return "🚨";
    return "⏰";
  };

  const totalCount = (stockData?.total_alerts || 0) + expiringItems.length;

  return (
    <div className="bg-gradient-to-r from-rose-950/40 via-amber-950/30 to-slate-900/60 backdrop-blur-md border border-rose-500/20 rounded-2xl p-4 shadow-xl text-left">
      {/* Header Bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="text-lg">⚠️</span>
            <span className="absolute -top-1 -right-2 h-4 w-4 rounded-full bg-rose-500 text-[9px] font-black text-white flex items-center justify-center animate-pulse">
              {totalCount}
            </span>
          </div>
          <div>
            <span className="text-sm font-bold text-white">
              {stockData && stockData.out_of_stock_count > 0 && `${stockData.out_of_stock_count} out of stock`}
              {stockData && stockData.out_of_stock_count > 0 && stockData.low_stock_count > 0 && ", "}
              {stockData && stockData.low_stock_count > 0 && `${stockData.low_stock_count} running low`}
              {expiringItems.length > 0 && (
                <>
                  {stockData && stockData.total_alerts > 0 && " | "}
                  <span className="text-orange-400 font-bold">{expiringItems.length} expiring soon</span>
                </>
              )}
            </span>
            {stockData && stockData.auto_added_to_grocery.length > 0 && (
              <span className="ml-2 text-[10px] font-semibold text-emerald-400 block sm:inline">
                ✓ {stockData.auto_added_to_grocery.length} auto-added to grocery list
              </span>
            )}
          </div>
        </div>
        <span className="text-slate-500 text-xs font-semibold shrink-0">
          {expanded ? "▲ Collapse" : "▼ Expand"}
        </span>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Stock Alerts */}
          {stockData && stockData.total_alerts > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Stock Alerts</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {stockData.alerts.map((alert: LowStockAlert) => (
                  <div
                    key={alert.item_name}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${severityClass(alert.severity)}`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{severityIcon(alert.severity)}</span>
                      <span className="font-bold text-white">{alert.item_name}</span>
                    </div>
                    <span className="text-[9px] uppercase font-mono font-bold tracking-wide">
                      {alert.stock_level}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expiry Alerts */}
          {expiringItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Expiry Warnings</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {expiringItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${urgencyClass(item.urgency)}`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{urgencyIcon(item.urgency)}</span>
                      <span className="font-bold text-white">{item.item_name}</span>
                    </div>
                    <span className="text-[9px] uppercase font-mono font-bold tracking-wide">
                      {item.urgency === "today" ? "Urgent" : item.urgency === "tomorrow" ? "Tomorrow" : `${item.days_left}d left`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auto-added notification */}
      {expanded && stockData && stockData.auto_added_to_grocery.length > 0 && (
        <div className="mt-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-semibold flex items-center justify-between">
          <span>✅ Auto-restocked to grocery list: {stockData.auto_added_to_grocery.join(", ")}</span>
          <button
            onClick={() => {
              onRefreshData();
              loadAlerts();
            }}
            className="underline hover:text-emerald-300 transition"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
