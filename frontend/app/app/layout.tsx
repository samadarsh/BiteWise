"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { DashboardProvider, useDashboard } from "../../lib/dashboard-context";
import { UserMenuHeader } from "../../components/UserMenuHeader";
import { ThemeToggle } from "../../components/ThemeToggle";
import DemoControlBar from "../../components/DemoControlBar";
import AlertBanner from "../../components/AlertBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardProvider>
  );
}

const PRODUCTS = [
  {
    href: "/app/nutriorder",
    eyebrow: "NutriOrder AI",
    title: "Health-aware Swiggy food ordering",
    blurb: "Macros, meal ranking, coupons, safe checkout, nutrition logging.",
    activeCls: "border-nutri bg-nutri/10 shadow-sm",
    accent: "text-nutri",
    dot: "bg-nutri",
  },
  {
    href: "/app/smartpantry",
    eyebrow: "SmartPantry AI",
    title: "Household pantry and grocery intelligence",
    blurb: "Low-stock alerts, recipe matching, grocery grouping, cart preview.",
    activeCls: "border-pantry bg-pantry/10 shadow-sm",
    accent: "text-pantry",
    dot: "bg-pantry",
  },
];

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, openAuthModal, loginAsGuest } = useAuth();
  const { alert, clearAlert, showAlert, refreshData, requestEditProfile } = useDashboard();
  const pathname = usePathname();
  const router = useRouter();
  const [demoLoading, setDemoLoading] = useState(false);

  const handleSeed = async () => {
    setDemoLoading(true);
    try {
      const res = await api.seedDemo();
      showAlert(res.message || "Demo data loaded successfully.", "success");
      refreshData();
    } catch (err) {
      showAlert(`Could not load demo data: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleReset = async () => {
    setDemoLoading(true);
    try {
      const res = await api.resetDemo();
      showAlert(res.message || "Session cleared and reset.", "success");
      refreshData();
    } catch (err) {
      showAlert(`Could not reset: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleEditProfile = () => {
    requestEditProfile();
    if (pathname !== "/app/nutriorder") router.push("/app/nutriorder");
  };

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col font-sans selection:bg-nutri/30">
      {/* Ambient glows */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-nutri/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-brand/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-black text-brand-contrast group-hover:scale-105 transition-transform">B</span>
            <div className="leading-tight hidden sm:block">
              <span className="block text-base font-bold text-text">BiteWise</span>
              <span className="block text-[9px] uppercase tracking-wider text-subtle font-bold">NutriOrder AI · SmartPantry AI</span>
            </div>
            <span className="block sm:hidden text-sm font-bold text-text">BiteWise</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <UserMenuHeader onEditProfile={handleEditProfile} />
          </div>
        </div>
      </header>

      {isLoading ? (
        <main className="flex-1 flex flex-col items-center justify-center gap-4">
          <Spinner className="h-10 w-10 text-nutri" />
          <p className="text-sm text-subtle font-mono">Loading BiteWise…</p>
        </main>
      ) : !isAuthenticated ? (
        <main className="flex-1 max-w-4xl mx-auto px-4 flex flex-col items-center justify-center text-center py-12 sm:py-20">
          <div className="bg-surface border border-border p-6 sm:p-10 rounded-2xl shadow-xl max-w-xl w-full flex flex-col items-center gap-5 sm:gap-6">
            <div className="h-16 w-16 bg-nutri rounded-2xl flex items-center justify-center text-3xl shadow-lg">🥗</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text">
              Welcome to <span className="text-nutri">BiteWise</span>
            </h2>
            <p className="text-muted text-sm leading-relaxed">
              Choose NutriOrder AI for health-aware meal ordering or SmartPantry AI for pantry, recipe, and grocery planning.
            </p>
            <button onClick={openAuthModal} className="w-full bg-brand hover:brightness-105 text-brand-contrast font-black py-3.5 rounded-xl transition text-sm sm:text-base shadow-lg">
              Sign In to BiteWise
            </button>
            <button onClick={loginAsGuest} className="w-full bg-surface-2 hover:bg-surface-3 text-text font-bold py-3.5 rounded-xl transition text-sm sm:text-base border border-border hover:border-border-strong">
              Continue as Guest
            </button>
            <Link href="/" className="text-muted hover:text-text text-sm font-semibold underline transition mt-1">Back to Landing Page</Link>
          </div>
        </main>
      ) : (
        <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-8 flex flex-col gap-4 sm:gap-6">
          <DemoControlBar onSeed={handleSeed} onReset={handleReset} loading={demoLoading} />

          {alert && <AlertBanner message={alert.message} type={alert.type} onClose={clearAlert} />}

          {/* Product Switcher Navigation */}
          <nav className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-border pb-4">
            {PRODUCTS.map((p) => {
              const isActive = pathname === p.href;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-xl border p-3 sm:p-4 text-left transition-all duration-200 ${
                    isActive ? p.activeCls : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <span className={`flex items-center gap-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider ${p.accent}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
                    {p.eyebrow}
                  </span>
                  <span className="mt-1 block text-xs sm:text-sm font-bold text-text">{p.title}</span>
                  <span className="hidden sm:block mt-1 text-xs text-subtle">{p.blurb}</span>
                </Link>
              );
            })}
          </nav>

          {children}
        </div>
      )}
    </div>
  );
}
