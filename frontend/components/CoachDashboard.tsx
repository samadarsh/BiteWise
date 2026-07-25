import React, { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { api, CoachStatusResponse, NutritionEntry, RecommendationMeal, TrendsResponse, WeightEntry } from "../lib/api";
import NutritionProgress from "./NutritionProgress";
import DailyMealLog from "./DailyMealLog";
import ManualNutritionEntry from "./ManualNutritionEntry";
import NextMealSuggestion from "./NextMealSuggestion";
import WeeklyTrendChart from "./WeeklyTrendChart";
import WeightTrendCard from "./WeightTrendCard";

interface CoachDashboardProps {
  activeSessionId: string;
  onSelectMeal: (meal: RecommendationMeal) => void;
}

export interface CoachDashboardRef {
  refreshCoachData: () => Promise<void>;
}

const CoachDashboard = forwardRef<CoachDashboardRef, CoachDashboardProps>(
  ({ activeSessionId, onSelectMeal }, ref) => {
    const [status, setStatus] = useState<CoachStatusResponse | null>(null);
    const [history, setHistory] = useState<NutritionEntry[]>([]);
    const [trends, setTrends] = useState<TrendsResponse | null>(null);
    const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [manualLoading, setManualLoading] = useState(false);
    const [weightLogging, setWeightLogging] = useState(false);
    const [showManualEntry, setShowManualEntry] = useState(false);

    const refreshCoachData = async () => {
      setLoading(true);
      try {
        const [statusData, historyData, trendsData, weightData] = await Promise.all([
          api.getCoachStatus(),
          api.getCoachHistory(),
          api.getCoachTrends(7),
          api.getWeightHistory(30),
        ]);
        setStatus(statusData);
        setHistory(historyData);
        setTrends(trendsData);
        setWeightHistory(weightData);
      } catch (err) {
        console.error("Failed to refresh coach dashboard status", err);
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

    const handleAddManualEntry = async (entry: { meal_name: string; calories: number; protein_g: number }) => {
      setManualLoading(true);
      try {
        await api.addManualEntry(entry);
        await refreshCoachData();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(`Failed to save manual food entry: ${msg}`);
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
        alert(`Failed to log weight: ${msg}`);
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

        {status && <NutritionProgress status={status} currentStreak={trends?.current_streak ?? 0} />}

        <NextMealSuggestion activeSessionId={activeSessionId} onSelectMeal={onSelectMeal} />

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
