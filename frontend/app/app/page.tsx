"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const CHOSEN_PRODUCT_KEY = "bitewise_chosen_product";

const PRODUCTS = [
  {
    href: "/app/nutriorder",
    label: "NutriOrder AI",
    tagline: "Your personal health guide",
    description: "Biometric-aware targets, a coach that tracks your progress, and meal ordering that closes the gap to your goal.",
    accent: "text-nutri",
    border: "hover:border-nutri/50",
    bg: "bg-nutri",
    contrast: "text-nutri-contrast",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
        <path d="M7 3v6a2 2 0 0 0 2 2v10M7 3a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2M11 3v18M17 3a4 4 0 0 0-4 4v3a2 2 0 0 0 2 2h2v9" />
      </svg>
    ),
  },
  {
    href: "/app/smartpantry",
    label: "SmartPantry AI",
    tagline: "Your household's kitchen intelligence",
    description: "Tell it what you want to cook or need to order — it checks your pantry, fills the gap, and keeps stock honest.",
    accent: "text-pantry",
    border: "hover:border-pantry/50",
    bg: "bg-pantry",
    contrast: "text-pantry-contrast",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
        <path d="M3 9h18l-1.5 10.5a2 2 0 0 1-2 1.5H6.5a2 2 0 0 1-2-1.5L3 9Z" />
        <path d="M8 9V6a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
];

export default function AppIndexPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const chosen = typeof window !== "undefined" ? localStorage.getItem(CHOSEN_PRODUCT_KEY) : null;
    if (chosen === "/app/nutriorder" || chosen === "/app/smartpantry") {
      router.replace(chosen);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time check of a returning-user flag before deciding whether to render the chooser
      setChecked(true);
    }
  }, [router]);

  const choose = (href: string) => {
    try {
      localStorage.setItem(CHOSEN_PRODUCT_KEY, href);
    } catch {
      /* ignore */
    }
    router.push(href);
  };

  if (!checked) return null;

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center py-12 sm:py-20 px-4">
      <div className="text-center mb-12 sm:mb-16 max-w-xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-subtle mb-3">Welcome to BiteWise</p>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-text leading-[1.1]">Which platform do you want to open?</h1>
        <p className="text-sm sm:text-base text-muted mt-4">You can switch anytime from the sidebar — this only picks where you land today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-3xl">
        {PRODUCTS.map((p) => (
          <button
            key={p.href}
            onClick={() => choose(p.href)}
            className={`group text-left bg-surface border border-border ${p.border} rounded-3xl p-8 flex flex-col gap-5 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}
          >
            <span className={`h-14 w-14 rounded-2xl ${p.bg} ${p.contrast} flex items-center justify-center shadow-md`}>{p.icon}</span>
            <div>
              <h2 className="text-xl font-extrabold text-text tracking-tight">{p.label}</h2>
              <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${p.accent}`}>{p.tagline}</p>
              <p className="text-sm text-muted mt-3 leading-relaxed">{p.description}</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${p.accent} mt-1`}>
              Open {p.label}
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
