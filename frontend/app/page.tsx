'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { api, UserProfile } from "../lib/api";

const personalHighlights = [
  "Fitness-goal profile with calories, protein, preferences, allergies, and budget",
  "Explainable meal ranking across nutrition, cost, delivery time, taste, and availability",
  "Swiggy Food MCP checkout with cart review, coupon support, and explicit confirmation"
];

const householdHighlights = [
  "Pantry memory for staples, fresh produce, snacks, and cooking essentials",
  "Missing-ingredient detection for recipes, meal plans, and family grocery requests",
  "Instamart MCP grocery cart building, clear-cart cleanup, checkout, and tracking"
];

const platformSteps = [
  {
    title: "Understand the context",
    body: "NutriOrder AI starts from the user's goal, address, preferences, budget, and daily nutrition targets."
  },
  {
    title: "Search real availability",
    body: "The assistant queries Swiggy MCP tools for food now, and the same product shell can expand to Instamart groceries."
  },
  {
    title: "Rank and explain",
    body: "Recommendations show estimated macros, confidence, tradeoffs, coupons, distance, and delivery timing before checkout."
  },
  {
    title: "Confirm before action",
    body: "Orders stay behind review, safety locks, payment-method checks, and explicit user confirmation."
  }
];

interface SwiggyConfigStatus {
  use_mock_mcp: boolean;
  swiggy_env: string;
  database_connected: boolean;
  encryption_key_configured: boolean;
  client_id_configured: boolean;
  client_secret_configured: boolean;
  redirect_uri_configured: boolean;
}

export default function LandingPage() {
  const [authLoading, setAuthLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [swiggyStatus, setSwiggyStatus] = useState<SwiggyConfigStatus | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    // Query session & staging status
    const loadSessionData = async () => {
      // 1. Read URL auth_error search param asynchronously in effect to avoid cascading render lint warning
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const err = params.get("auth_error");
        if (err) {
          setMessage("Swiggy login failed. Please try again.");
        }
      }

      try {
        const [prof, status] = await Promise.all([
          api.getProfile(),
          api.getSwiggyStatus()
        ]);
        setUserProfile(prof);
        setSwiggyStatus(status);
      } catch {
        // Fallback status read on unauthenticated profile error
        try {
          const status = await api.getSwiggyStatus();
          setSwiggyStatus(status);
        } catch {
          // ignore
        }
      } finally {
        setSessionLoading(false);
      }
    };
    loadSessionData();
  }, []);

  const startSwiggyLogin = async () => {
    setAuthLoading(true);
    setMessage("");
    try {
      const res = await api.startSwiggyOAuth();
      window.location.href = res.redirect_url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`Swiggy login is not ready yet: ${msg}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const startDemo = async () => {
    setDemoLoading(true);
    setMessage("");
    try {
      await api.demoLogin();
      window.location.href = "/app";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`Sandbox demo is not available in this environment: ${msg}`);
    } finally {
      setDemoLoading(false);
    }
  };

  const showDemoCTA = swiggyStatus?.use_mock_mcp !== false;

  return (
    <main className="min-h-screen bg-[#f7f4ec] text-[#17211c]">
      <section
        className="relative min-h-[86svh] overflow-hidden bg-[#17211c] text-white"
        style={{
          backgroundImage: "linear-gradient(90deg, rgba(15, 22, 18, 0.94) 0%, rgba(15, 22, 18, 0.76) 42%, rgba(15, 22, 18, 0.32) 100%), url('/landing-food-system.png')",
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        <header className="relative z-10 mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="NutriOrder AI home">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#f4b544] text-sm font-black text-[#17211c]">
              N
            </span>
            <span className="text-base font-bold">NutriOrder AI</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-white/78 md:flex">
            <a href="#modes" className="hover:text-white">Modes</a>
            <a href="#how-it-works" className="hover:text-white">How It Works</a>
            <a href="#safety" className="hover:text-white">Safety</a>
          </nav>
          <Link
            href="/app"
            className="rounded-md border border-white/24 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/70 hover:bg-white/10"
          >
            Open App
          </Link>
        </header>

        <div className="relative z-10 mx-auto flex min-h-[calc(86svh-80px)] max-w-7xl items-center px-5 pb-14 pt-8 sm:px-8">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex rounded-md border border-[#f4b544]/40 bg-[#f4b544]/14 px-3 py-1 text-xs font-semibold uppercase text-[#ffd98a]">
              Built for Swiggy MCP execution
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-[1.02] sm:text-6xl lg:text-7xl">
              NutriOrder AI
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-8 text-white/84">
              A food intelligence platform that turns health goals, household context, and real-time Swiggy availability into better meals, groceries, and orders.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {sessionLoading ? (
                <div className="h-12 w-48 rounded-md bg-white/10 animate-pulse" />
              ) : userProfile ? (
                <Link
                  href="/app"
                  className="rounded-md bg-[#f4b544] px-6 py-3.5 text-sm font-black text-[#17211c] shadow-[0_18px_50px_rgba(244,181,68,0.28)] transition hover:bg-[#ffd071] inline-block text-center"
                >
                  Open Dashboard
                </Link>
              ) : (
                <>
                  <button
                    onClick={startSwiggyLogin}
                    disabled={authLoading}
                    className="rounded-md bg-[#f4b544] px-6 py-3.5 text-sm font-black text-[#17211c] shadow-[0_18px_50px_rgba(244,181,68,0.28)] transition hover:bg-[#ffd071] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authLoading ? "Starting Swiggy Login" : "Continue with Swiggy"}
                  </button>
                  {showDemoCTA && (
                    <button
                      onClick={startDemo}
                      disabled={demoLoading}
                      className="rounded-md border border-white/28 bg-white/8 px-6 py-3.5 text-sm font-bold text-white transition hover:border-white/70 hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {demoLoading ? "Opening Sandbox" : "Try Sandbox Demo"}
                    </button>
                  )}
                </>
              )}
            </div>

            {message && (
              <p className="mt-5 max-w-xl rounded-md border border-[#df6b57]/50 bg-[#df6b57]/16 px-4 py-3 text-sm text-[#ffd7cf]">
                {message}
              </p>
            )}

            <dl className="mt-10 grid max-w-2xl grid-cols-3 gap-3 text-white">
              <div className="border-l border-white/20 pl-4">
                <dt className="text-2xl font-black">2</dt>
                <dd className="mt-1 text-xs text-white/68">Product modes</dd>
              </div>
              <div className="border-l border-white/20 pl-4">
                <dt className="text-2xl font-black">48+</dt>
                <dd className="mt-1 text-xs text-white/68">Verified tests</dd>
              </div>
              <div className="border-l border-white/20 pl-4">
                <dt className="text-2xl font-black">1</dt>
                <dd className="mt-1 text-xs text-white/68">Safety-gated checkout</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section id="modes" className="mx-auto grid max-w-7xl gap-5 px-5 py-14 sm:px-8 lg:grid-cols-2">
        <article className="rounded-lg border border-[#d6cdbd] bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-xs font-black uppercase text-[#2f6f5e]">Live product surface</p>
            <span className="rounded-md bg-[#2f6f5e]/10 px-3 py-1 text-xs font-bold text-[#2f6f5e]">
              Food MCP
            </span>
          </div>
          <h2 className="text-3xl font-black">Personal Nutrition Coach</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#546158]">
            The current NutriOrder AI experience helps one user choose high-fit meals, review cart details, apply coupons, place controlled orders, and log nutrition automatically.
          </p>
          <ul className="mt-6 space-y-3">
            {personalHighlights.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-[#303c35]">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#2f6f5e]" />
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-lg border border-[#d6cdbd] bg-[#fffaf0] p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-xs font-black uppercase text-[#b24f3d]">Next platform module</p>
            <span className="rounded-md bg-[#b24f3d]/10 px-3 py-1 text-xs font-bold text-[#b24f3d]">
              Instamart MCP
            </span>
          </div>
          <h2 className="text-3xl font-black">Smart Household Assistant</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#5d5b51]">
            The household mode expands NutriOrder from individual meals to the home food lifecycle: pantry awareness, recipe planning, missing items, family requests, and grocery execution.
          </p>
          <ul className="mt-6 space-y-3">
            {householdHighlights.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-[#39372f]">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#b24f3d]" />
                {item}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section id="how-it-works" className="bg-[#17211c] px-5 py-16 text-white sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase text-[#f4b544]">Operating model</p>
            <h2 className="mt-3 text-4xl font-black">One assistant, two food decisions</h2>
            <p className="mt-4 text-sm leading-6 text-white/68">
              The landing page should not trap us in a diet-only story. It should describe a platform that can decide whether the user needs a ready meal, groceries, or a planned household basket.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {platformSteps.map((step, index) => (
              <article key={step.title} className="rounded-lg border border-white/12 bg-white/7 p-5">
                <p className="text-sm font-black text-[#f4b544]">0{index + 1}</p>
                <h3 className="mt-4 text-lg font-black">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/66">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="safety" className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <p className="text-xs font-black uppercase text-[#405c91]">Why this direction works</p>
          <h2 className="mt-3 text-4xl font-black">It becomes a food operating layer, not another ordering wrapper.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Repeat behavior", "Users eat daily and households restock weekly, so retention can come from recurring decisions."],
            ["Clear MCP usage", "Swiggy is the execution layer for search, cart, coupon, checkout, and tracking instead of a passive data source."],
            ["Defensible memory", "Nutrition logs, preferences, pantry state, go-to items, and feedback make the assistant better over time."],
            ["Controlled trust", "Every mutating action stays behind review, explicit confirmation, order caps, and environment locks."]
          ].map(([title, body]) => (
            <article key={title} className="rounded-lg border border-[#d6cdbd] bg-white p-5 shadow-sm">
              <h3 className="text-lg font-black">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#59645d]">{body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
