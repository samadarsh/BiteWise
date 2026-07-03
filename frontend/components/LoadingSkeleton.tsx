import React from "react";

export default function LoadingSkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-4 w-full">
      <div className="h-6 bg-slate-800 rounded-lg w-1/3"></div>
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-slate-800 bg-slate-900/20 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="h-4 bg-slate-800 rounded w-1/2"></div>
              <div className="h-4 bg-slate-800 rounded-full w-12"></div>
            </div>
            <div className="h-3 bg-slate-850 rounded w-1/3 mt-1"></div>
            <div className="flex justify-between mt-3 pt-2 border-t border-slate-850">
              <div className="h-3 bg-slate-850 rounded w-20"></div>
              <div className="h-3 bg-slate-850 rounded w-12"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
