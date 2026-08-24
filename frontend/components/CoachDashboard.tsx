import React, { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { api, CoachStatusResponse, NutritionEntry, RecommendationMeal, TrendsResponse, WeightEntry } from "../lib/api";
import NutritionProgress from "./NutritionProgress";
import DailyMealLog from "./DailyMealLog";
import ManualNutritionEntry from "./ManualNutritionEntry";
import ScanFoodModal from "./ScanFoodModal";
import NextMealSuggestion from "./NextMealSuggestion";
import FirstOrderPrompt from "./FirstOrderPrompt";
import WeeklyTrendChart from "./WeeklyTrendChart";
import WeightTrendCard from "./WeightTrendCard";
import { useDashboard } from "../lib/dashboard-context";

const PLACED_ORDER_STATUSES = new Set(["ORDER_PLACED", "TRACKING"]);

interface CoachDashboardProps {
  activeSessionId: string;
  onSelectMeal: (meal: RecommendationMeal) => void;
}

export interface CoachDashboardRef {
  refreshCoachData: () => Promise<void>;
}

const CoachDashboard = forwardRef<CoachDashboardRef, CoachDashboardProps>(
  ({ activeSessionId, onSelectMeal }, ref) => {
    const { showAlert } = useDashboard();
    const [status, setStatus] = useState<CoachStatusResponse | null>(null);
    const [history, setHistory] = useState<NutritionEntry[]>([]);
    const [trends, setTrends] = useState<TrendsResponse | null>(null);
    const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
    const [hasPlacedOrder, setHasPlacedOrder] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [manualLoading, setManualLoading] = useState(false);
    const [weightLogging, setWeightLogging] = useState(false);
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [showScanModal, setShowScanModal] = useState(false);

    const refreshCoachData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [statusData, historyData, trendsData, weightData, sessions] = await Promise.all([
          api.getCoachStatus(),
          api.getCoachHistory(),
          api.getCoachTrends(7),
          api.getWeightHistory(30),
          api.getOrderSessions(),
        ]);
        setStatus(statusData);
        setHistory(historyData);
        setTrends(trendsData);
        setWeightHistory(weightData);
        setHasPlacedOrder(sessions.some((s) => PLACED_ORDER_STATUSES.has(s.status)));
      } catch (err) {
        console.error("Failed to refresh coach dashboard status", err);
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    useImperativeHandle(ref, () => ({
      refreshCoachData,
    }));

    useEffect(() => {
      refreshCoachData();
    }, []);

    const handleAddManualEntry = async (entry: {
      meal_name: string;
      calories: number;
      protein_g: number;
      carbs_g?: number;
      fat_g?: number;
      source?: string;
      confidence?: number;
      is_estimated?: boolean;
      micronutrients?: Record<string, string> | null;
    }) => {
      setManualLoading(true);
      try {
        await api.addManualEntry(entry);
        await refreshCoachData();
        setShowScanModal(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showAlert(`Failed to save manual food entry: ${msg}`, "error");
      } finally {
        setManualLoading(false);
      }
    };

    const handleLogWeight = async (weightKg: number) => {
      setWeightLogging(true);
      try {
        await api.logWeight(weightKg);
        await refreshCoachData();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showAlert(`Failed to log weight: ${msg}`, "error");
      } finally {
        setWeightLogging(false);
      }
    };

    return (
      <div className="flex flex-col gap-5 text-left">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-text">Your Health Coach</h1>
            <p className="text-xs text-subtle mt-0.5">Tracking today, this week, and what&apos;s next.</p>
          </div>
          {loading && (
            <svg className="animate-spin h-4 w-4 text-info" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
        </div>

        <button
          onClick={() => setShowScanModal(true)}
          className="w-full bg-gradient-to-r from-nutri/15 to-nutri/5 border border-nutri/30 rounded-2xl p-4 flex items-center gap-4 hover:border-nutri/50 hover:shadow-md transition text-left group"
        >
          <span className="h-12 w-12 rounded-xl bg-nutri flex items-center justify-center text-2xl shrink-0 shadow-md group-hover:scale-105 transition-transform">
            📷
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text">Scan Your Meal</p>
            <p className="text-xs text-muted mt-0.5">Snap a photo — AI identifies the food and estimates calories, protein &amp; more</p>
          </div>
          <span className="text-nutri text-lg shrink-0 group-hover:translate-x-1 transition-transform">→</span>
        </button>

        {showScanModal && (
          <ScanFoodModal onAdd={handleAddManualEntry} onClose={() => setShowScanModal(false)} loading={manualLoading} />
        )}

        {status && <NutritionProgress status={status} currentStreak={trends?.current_streak ?? 0} />}

        {hasPlacedOrder === null && loadError ? (
          <div className="bg-danger/5 border border-danger/20 rounded-2xl p-5 flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-danger">⚠️ Couldn&apos;t load your Coach dashboard: {loadError}</p>
            <button
              onClick={() => refreshCoachData()}
              className="text-xs font-semibold text-danger underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        ) : hasPlacedOrder === null ? (
          <div className="bg-info/5 border border-info/20 rounded-2xl p-5 h-[120px] animate-pulse" />
        ) : hasPlacedOrder ? (
          <NextMealSuggestion activeSessionId={activeSessionId} onSelectMeal={onSelectMeal} />
        ) : (
          <FirstOrderPrompt />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-xl p-4">
            {trends && <WeeklyTrendChart days={trends.days} />}
          </div>
          <WeightTrendCard
            entries={weightHistory}
            currentWeight={weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].weight_kg : null}
            onLogWeight={handleLogWeight}
            logging={weightLogging}
          />
        </div>

        <DailyMealLog entries={history} />

        <div className="border-t border-border pt-4">
          <button onClick={() => setShowManualEntry((v) => !v)} className="text-xs font-semibold text-subtle hover:text-text transition flex items-center gap-1.5">
            <span className={`transition-transform duration-200 ${showManualEntry ? "rotate-90" : ""}`}>▸</span>
            Log a meal manually
          </button>
          {showManualEntry && (
            <div className="mt-3">
              <ManualNutritionEntry onAdd={handleAddManualEntry} loading={manualLoading} />
            </div>
          )}
        </div>
      </div>
    );
  }
);

CoachDashboard.displayName = "CoachDashboard";
export default CoachDashboard;
