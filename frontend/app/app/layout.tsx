"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { DashboardProvider, useDashboard } from "../../lib/dashboard-context";
import { UserMenuHeader } from "../../components/UserMenuHeader";
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
    active: "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/5",
    accent: "text-emerald-400",
  },
  {
    href: "/app/smartpantry",
    eyebrow: "SmartPantry AI",
    title: "Household pantry and grocery intelligence",
    blurb: "Low-stock alerts, recipe matching, grocery grouping, cart preview.",
    active: "border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/5",
    accent: "text-amber-400",
  },
];

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
      showAlert(res.message || "Demo data seeded successfully.", "success");
      refreshData();
    } catch (err) {
      showAlert(`Demo seed failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleReset = async () => {
    setDemoLoading(true);
    try {
      const res = await api.resetDemo();
      showAlert(res.message || "Demo session cleared and reset successfully.", "success");
      refreshData();
    } catch (err) {
      showAlert(`Demo reset failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setDemoLoading(false);
    }
  };

  const handleEditProfile = () => {
    requestEditProfile();
    if (pathname !== "/app/nutriorder") router.push("/app/nutriorder");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Background Glows */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 cursor-pointer shrink-0">
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-[#f4b544] text-xs sm:text-sm font-black text-slate-950">B</span>
            <div className="leading-tight hidden sm:block">
              <span className="block text-base font-bold bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">BiteWise</span>
              <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">NutriOrder AI · SmartPantry AI</span>
            </div>
            <span className="block sm:hidden text-sm font-bold bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">BiteWise</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <UserMenuHeader onEditProfile={handleEditProfile} />
          </div>
        </div>
      </header>

      {isLoading ? (
        <main className="flex-1 flex flex-col items-center justify-center gap-4">
          <svg className="animate-spin h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-slate-500 font-mono">Loading BiteWise…</p>
        </main>
      ) : !isAuthenticated ? (
        <main className="flex-1 max-w-4xl mx-auto px-4 flex flex-col items-center justify-center text-center py-12 sm:py-20">
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 p-6 sm:p-10 rounded-2xl shadow-2xl max-w-xl w-full flex flex-col items-center gap-5 sm:gap-6">
            <div className="h-14 w-14 sm:h-16 sm:w-16 bg-gradient-to-tr from-emerald-400 to-lime-300 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shadow-xl shadow-emerald-500/15">🥗</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome to <span className="bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">BiteWise</span>
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Choose NutriOrder AI for health-aware meal ordering or SmartPantry AI for pantry, recipe, and grocery planning.
            </p>
            <button onClick={openAuthModal} className="w-full bg-[#f4b544] hover:bg-[#ffd071] text-[#17211c] font-black py-3.5 rounded-xl transition-all duration-200 text-sm sm:text-base shadow-xl hover:shadow-2xl hover:shadow-[#f4b544]/20 flex items-center justify-center gap-2">
              Sign In to BiteWise
            </button>
            <button onClick={loginAsGuest} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl transition-all duration-200 text-sm sm:text-base shadow-xl border border-slate-700 hover:border-slate-600 flex items-center justify-center gap-2">
              Continue as Guest
            </button>
            <Link href="/" className="text-slate-400 hover:text-slate-200 text-sm font-semibold underline transition-all mt-1">Back to Landing Page</Link>
          </div>
        </main>
      ) : (
        <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-8 flex flex-col gap-4 sm:gap-6">
          <DemoControlBar onSeed={handleSeed} onReset={handleReset} loading={demoLoading} />

          {alert && <AlertBanner message={alert.message} type={alert.type} onClose={clearAlert} />}

          {/* Product Switcher Navigation */}
          <nav className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-slate-900 pb-4">
            {PRODUCTS.map((p) => {
              const isActive = pathname === p.href;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  className={`rounded-xl border p-3 sm:p-4 text-left transition-all duration-200 ${
                    isActive ? p.active : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60"
                  }`}
                >
                  <span className={`block text-[10px] sm:text-xs font-black uppercase tracking-wider ${p.accent}`}>{p.eyebrow}</span>
                  <span className="mt-0.5 sm:mt-1 block text-xs sm:text-sm font-bold text-slate-100">{p.title}</span>
                  <span className="hidden sm:block mt-1 text-xs text-slate-500">{p.blurb}</span>
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
