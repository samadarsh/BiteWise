'use client';

import React from "react";

interface PitchStepCardProps {
  stepNumber: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onNext?: () => void;
  onPrev?: () => void;
  isLast?: boolean;
}

export default function PitchStepCard({
  stepNumber,
  totalSteps,
  title,
  subtitle,
  children,
  onNext,
  onPrev,
  isLast,
}: PitchStepCardProps) {
  return (
    <section className="min-h-[80vh] flex flex-col justify-center py-12 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto w-full">
        {/* Step Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#f4b544] to-[#e09422] opacity-20 blur-sm" />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#f4b544] to-[#e09422] text-sm font-black text-[#17211c] shadow-lg">
              {stepNumber}
            </span>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#f4b544]/70">
              Step {stepNumber} of {totalSteps}
            </p>
            <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight mt-0.5">
              {title}
            </h2>
          </div>
        </div>

        <p className="text-sm text-white/60 leading-relaxed mb-8 max-w-2xl">
          {subtitle}
        </p>

        {/* Content */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 shadow-xl">
          {children}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          {onPrev ? (
            <button
              onClick={onPrev}
              className="text-sm font-semibold text-white/50 hover:text-white/80 transition flex items-center gap-1.5"
            >
              <span>←</span> Previous
            </button>
          ) : (
            <div />
          )}
          {onNext && !isLast && (
            <button
              onClick={onNext}
              className="rounded-lg bg-[#f4b544] px-5 py-2.5 text-sm font-black text-[#17211c] shadow-[0_8px_30px_rgba(244,181,68,0.25)] transition hover:bg-[#ffd071] flex items-center gap-1.5"
            >
              Next Step <span>→</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
