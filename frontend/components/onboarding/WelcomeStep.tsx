import React from "react";

export default function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="bg-surface border border-border p-10 rounded-2xl shadow-xl w-full flex flex-col items-center text-center gap-5">
      <div className="h-16 w-16 bg-nutri rounded-2xl flex items-center justify-center text-3xl shadow-lg">🎯</div>
      <div>
        <h2 className="text-2xl font-extrabold text-text tracking-tight">Let&apos;s build your health profile</h2>
        <p className="text-sm text-muted mt-2 max-w-sm leading-relaxed">
          Three quick steps — your biometrics, your goals, and how you want meals ranked. Then your Coach starts tracking, and every recommendation is actually built for you.
        </p>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-subtle">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-nutri" /> Biometrics</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-nutri" /> Goals & diet</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-nutri" /> Ranking</span>
      </div>
      <button
        onClick={onNext}
        className="w-full bg-nutri hover:brightness-105 text-nutri-contrast font-bold py-3.5 rounded-xl transition text-sm shadow-md mt-2"
      >
        Get Started
      </button>
    </div>
  );
}
