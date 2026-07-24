import React from "react";

export default function LoadingSkeleton() {
  return (
    <div className="w-full space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border border-border bg-surface-2 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <div className="h-4 bg-border-strong rounded w-1/2" />
            <div className="h-4 bg-border-strong rounded-full w-12" />
          </div>
          <div className="h-3 bg-border rounded w-1/3" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-14 bg-border/60 rounded-lg" />
            <div className="h-14 bg-border/60 rounded-lg" />
          </div>
          <div className="flex justify-between">
            <div className="h-3 bg-border/60 rounded w-20" />
            <div className="h-3 bg-border/60 rounded w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}
