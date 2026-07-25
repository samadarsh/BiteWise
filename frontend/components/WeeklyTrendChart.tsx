import React, { useState } from "react";
import { DayTrend } from "../lib/api";

interface WeeklyTrendChartProps {
  days: DayTrend[];
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WeeklyTrendChart({ days }: WeeklyTrendChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (days.length === 0) return null;

  const maxProtein = Math.max(...days.map((d) => Math.max(d.protein, d.target_protein)), 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-subtle font-bold uppercase tracking-wider text-[10px]">📈 This Week — Protein vs. Target</span>
        <div className="flex items-center gap-3 text-[9px] text-subtle">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-success" /> On track
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-surface-3 border border-border-strong" /> Below target
          </span>
        </div>
      </div>

      <div className="relative flex items-end justify-between gap-2 h-28 px-1">
        {days.map((day, idx) => {
          const barHeightPct = Math.min(100, Math.round((day.protein / maxProtein) * 100));
          const targetLinePct = Math.min(100, Math.round((day.target_protein / maxProtein) * 100));
          const isToday = idx === days.length - 1;
          const weekdayLabel = WEEKDAY_LABELS[new Date(day.date + "T00:00:00").getDay()];

          return (
            <div key={day.date} className="relative flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
              <div
                className="relative w-full max-w-[28px] h-full flex items-end cursor-pointer"
                onMouseEnter={() => setHovered(idx)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Target line marker */}
                <div className="absolute left-0 right-0 border-t border-dashed border-border-strong" style={{ bottom: `${targetLinePct}%` }} />
                <div
                  className={`w-full rounded-t-md transition-all duration-300 ${day.hit_target ? "bg-success" : "bg-surface-3 border border-border-strong border-b-0"} ${isToday ? "ring-2 ring-nutri/40 ring-offset-1 ring-offset-surface" : ""}`}
                  style={{ height: `${Math.max(barHeightPct, 3)}%` }}
                />

                {hovered === idx && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 bg-surface border border-border-strong rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap text-[10px]">
                    <p className="font-bold text-text">{Math.round(day.protein)}g / {Math.round(day.target_protein)}g protein</p>
                    <p className="text-subtle">{Math.round(day.calories)} kcal</p>
                  </div>
                )}
              </div>
              <span className={`text-[9px] font-semibold ${isToday ? "text-nutri" : "text-subtle"}`}>{isToday ? "Today" : weekdayLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
