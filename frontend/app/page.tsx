'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Target,
  SearchCheck,
  ShieldCheck,
  ChartColumn,
  Zap,
  BatteryMedium,
  CookingPot,
  AlarmClock,
  Users,
  ShoppingCart,
  House,
  Package,
  Soup,
  ClipboardList,
  ShoppingBag,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { api, fetchAuthStatus, BiteWiseUser } from "../lib/api";
import { Reveal } from "../components/landing/Reveal";
import { StatCounter } from "../components/landing/StatCounter";
import { MarqueeStrip } from "../components/landing/MarqueeStrip";
import { PhoneMockup } from "../components/landing/PhoneMockup";
import { NutriOrderShowcase } from "../components/landing/NutriOrderShowcase";
import { SmartPantryShowcase } from "../components/landing/SmartPantryShowcase";

interface SwiggyConfigStatus {
  use_mock_mcp: boolean;
  swiggy_env: string;
  database_connected: boolean;
  encryption_key_configured: boolean;
  client_id_configured: boolean;
  client_secret_configured: boolean;
  redirect_uri_configured: boolean;
}

const heroStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

function rememberChosenProduct(product: "/app/nutriorder" | "/app/smartpantry") {
  try {
    localStorage.setItem("bitewise_chosen_product", product);
  } catch {
    /* ignore */
  }
}

const CAPABILITY_CHIPS = [
  "Swiggy MCP",
  "Explainable Ranking",
  "Safety-Gated Orders",
  "Household-Aware",
  "Deterministic Engine",
  "Nutrition Ledger",
];

const NUTRIORDER_STEPS = [
  {
    step: "01",
    title: "Set your health profile",
    desc: "Define calorie target, protein needs, dietary preference (veg/non-veg/vegan), allergies, cuisine preferences, and daily budget. The profile stays across sessions.",
  },
  {
    step: "02",
    title: "Get ranked meal recommendations",
    desc: "The ranking engine scores available Swiggy meals across 5 factors: nutrition fit, cost efficiency, delivery time, taste match, and availability. Each meal shows exactly why it scored the way it did.",
  },
  {
    step: "03",
    title: "Review cart and apply coupons",
    desc: "Before any order, you see the full cart breakdown — item details, pricing, applicable coupons, delivery fee, and payment methods. Nothing happens without your review.",
  },
  {
    step: "04",
    title: "Confirm and place order",
    desc: "Explicit confirmation required. Order placement is safety-gated: environment locks, order caps, and payment method checks all run before any Swiggy API mutation.",
  },
  {
    step: "05",
    title: "Track and log nutrition",
    desc: "Real-time order tracking through Swiggy MCP. After delivery, the meal's macros are logged to your nutrition ledger — building a persistent history of your food choices.",
  },
];

const NUTRIORDER_FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Target, title: "Multi-factor ranking", desc: "5 scoring dimensions: nutrition, cost, time, taste, availability — not just calories" },
  { icon: SearchCheck, title: "Explainable results", desc: "Every recommendation shows exactly why it ranked high or low, with per-factor breakdowns" },
  { icon: ShieldCheck, title: "Safety-gated ordering", desc: "Environment locks, order caps, and explicit confirmation prevent accidental or unsafe orders" },
  { icon: ChartColumn, title: "Nutrition ledger", desc: "Persistent log of meals ordered, macros consumed, and nutritional history over time" },
];

const SMARTPANTRY_STEPS = [
  {
    step: "01",
    title: "Set up your household",
    desc: "Create your household and add family members with their dietary preferences (veg/non-veg/vegan), allergies, calorie targets, and protein goals. SmartPantry respects everyone's constraints.",
  },
  {
    step: "02",
    title: "Stock your kitchen in seconds",
    desc: "Tap from a pre-populated template of common Indian kitchen items — rice, dal, milk, eggs, onions, spices — and set stock levels (Full, Half, Low, Empty). Stock 30 items in 15 seconds, not 15 minutes of typing.",
  },
  {
    step: "03",
    title: "Get low-stock and expiry alerts",
    desc: "SmartPantry watches your pantry: out-of-stock items auto-add to your grocery list, low-stock items show warnings, and perishables nearing expiry get flagged with \"use it or lose it\" recipe suggestions.",
  },
  {
    step: "04",
    title: "Ask \"What can I cook today?\"",
    desc: "SmartPantry matches your pantry stock against recipe templates, filters by your family's dietary constraints and allergies, and shows coverage — what you have, what's missing, and how ready each recipe is.",
  },
  {
    step: "05",
    title: "Auto-build your grocery list",
    desc: "Missing ingredients from recipes, out-of-stock items, and manual additions all flow into one smart grocery list — grouped by category (Dairy, Staples, Proteins), prioritized (Urgent, Soon, Optional).",
  },
  {
    step: "06",
    title: "Preview your Instamart cart",
    desc: "See what your grocery order would look like on Swiggy Instamart: matched products, estimated prices, category totals. Review before you buy — the preview is intelligence, not checkout.",
  },
];

const SMARTPANTRY_DIFFERENTIATORS: { icon: LucideIcon; label: string; detail: string }[] = [
  { icon: Zap, label: "15-second onboarding", detail: "Template kitchen, one-tap stock levels" },
  { icon: BatteryMedium, label: "Qualitative stock tracking", detail: "Full → Half → Low → Empty, no weighing" },
  { icon: CookingPot, label: "Auto-decrement on cook", detail: "Pantry updates when you mark a recipe as cooked" },
  { icon: AlarmClock, label: "Expiry awareness", detail: "\"Your curd expires tomorrow\" triggers action" },
  { icon: Users, label: "Multi-person dietary filtering", detail: "Veg, allergies, and calorie targets per member" },
  { icon: ShoppingCart, label: "Intelligent grocery priority", detail: "Urgent → Soon → Optional, auto-categorized" },
];

const SMARTPANTRY_FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: House, title: "Household model", desc: "Family members with individual dietary preferences, allergies, calorie and protein targets — shared kitchen, respected constraints." },
  { icon: Package, title: "Smart pantry tracking", desc: "Battery-style stock levels (Full/Half/Low/Empty). One tap to update. No weighing, no typing quantities. Low-stock auto-alerts." },
  { icon: Soup, title: "Recipe intelligence", desc: "\"What can I cook today?\" matches pantry stock against recipes, shows coverage, filters by family allergies and diet, and flags missing ingredients." },
  { icon: ClipboardList, title: "Priority grocery list", desc: "Auto-generated from stock alerts and recipe gaps. Grouped by category. Prioritized by urgency. Toggle items as purchased." },
  { icon: ShoppingBag, title: "Instamart cart preview", desc: "See estimated prices and product matches from Swiggy Instamart. Review the cart before deciding. Intelligence first, checkout later." },
  { icon: ChartColumn, title: "Household nutrition insights", desc: "Combined calorie and protein targets across all family members. Dietary conflict detection. Allergen aggregation." },
];

const HOW_IT_WORKS = [
  { num: "01", title: "Understand the context", body: "BiteWise separates personal nutrition context from shared household context, then routes the user to the right product." },
  { num: "02", title: "Pick the right surface", body: "NutriOrder AI handles ready-to-eat meals via Swiggy Food MCP. SmartPantry AI handles pantry, recipe, and grocery via Instamart MCP." },
  { num: "03", title: "Rank and explain", body: "Each product explains its reasoning — meal macro fit, pantry coverage gaps, recipe readiness, grocery priority tiers." },
  { num: "04", title: "Confirm before action", body: "Orders stay behind review screens, safety locks, payment checks, and explicit user confirmation. No silent mutations." },
];

const WHY_IT_WORKS = [
  ["Repeat behavior", "Users eat daily and households restock weekly, so retention comes from recurring decisions, not occasional use."],
  ["Clear MCP usage", "Swiggy is the execution layer for search, cart, coupon, checkout, and tracking — not a passive data source."],
  ["Defensible memory", "Nutrition logs, preferences, pantry state, go-to items, and feedback make the assistant more personalized over time."],
  ["Controlled trust", "Every mutating action stays behind review, explicit confirmation, order caps, and environment locks."],
];

export default function LandingPage() {
  const [demoLoading, setDemoLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sessionUser, setSessionUser] = useState<BiteWiseUser | null>(null);
  const [swiggyStatus, setSwiggyStatus] = useState<SwiggyConfigStatus | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [backendOffline, setBackendOffline] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const loadSessionData = async () => {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const err = params.get("auth_error");
        if (err) {
          setMessage("Swiggy login failed. Please try again.");
        }
      }

      try {
        await api.getHealth();
        setBackendOffline(false);
      } catch {
        setBackendOffline(true);
        setSessionLoading(false);
        return;
      }

      try {
        const [auth, status] = await Promise.all([
          fetchAuthStatus(),
          api.getSwiggyStatus()
        ]);
        setSessionUser(auth.authenticated ? auth.user : null);
        setSwiggyStatus(status);
      } catch {
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

  const startDemo = async () => {
    if (backendOffline) return;
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

  const showDemoCTA = !backendOffline && swiggyStatus?.use_mock_mcp === true;

  const navLinks = [
    { href: "#nutriorder", label: "NutriOrder AI" },
    { href: "#smartpantry", label: "SmartPantry AI" },
    { href: "#how-it-works", label: "How It Works" },
    { href: "#safety", label: "Safety" },
  ];

  return (
    <main className="min-h-screen bg-bg text-text">
      {/* Sticky Navbar — fixed "ink" brand chrome, deliberately independent of the light/dark toggle */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[#17211c]/95 backdrop-blur-lg shadow-lg shadow-black/10 border-b border-white/8"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 sm:h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 group" aria-label="BiteWise home">
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-[#f4b544] text-sm font-black text-[#17211c] group-hover:scale-105 transition-transform">
              B
            </span>
            <div className="leading-tight">
              <span className="block text-sm sm:text-base font-bold text-white">BiteWise</span>
              <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-wider text-white/40">Food decisions, made smarter</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3.5 py-2 text-sm font-medium text-white/60 rounded-lg transition-all duration-200 hover:text-white hover:bg-white/8"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/pitch"
              className="px-3.5 py-2 text-sm font-medium text-[#ffd98a] rounded-lg transition-all duration-200 hover:text-[#f4b544] hover:bg-[#f4b544]/10"
            >
              Demo
            </Link>
          </nav>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg hover:bg-white/10 transition"
            aria-label="Toggle menu"
          >
            <span className={`block w-5 h-0.5 bg-white transition-all duration-200 ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block w-5 h-0.5 bg-white transition-all duration-200 ${mobileMenuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-white transition-all duration-200 ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 bg-[#17211c]/98 backdrop-blur-xl border-b border-white/8 ${
            mobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="px-5 pb-5 pt-1 flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 text-sm font-medium text-white/70 rounded-lg hover:text-white hover:bg-white/8 transition-all"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/pitch"
              onClick={() => setMobileMenuOpen(false)}
              className="px-4 py-3 text-sm font-medium text-[#ffd98a] rounded-lg hover:bg-[#f4b544]/10 transition-all"
            >
              Demo Walkthrough
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section — fixed dark brand band with motion entrance + live phone mockup */}
      <section className="relative min-h-svh overflow-hidden bg-[#0b0f0d] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-24 h-[26rem] w-[26rem] rounded-full bg-[#f4b544]/20 blur-[110px]" />
          <div className="absolute top-1/3 -right-28 h-[30rem] w-[30rem] rounded-full bg-[#2f6f5e]/25 blur-[130px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] bg-[size:30px_30px]" />
        </div>

        <div className="relative z-10 mx-auto grid min-h-svh max-w-7xl items-center gap-10 px-5 pb-16 pt-24 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <motion.div variants={heroStagger} initial="hidden" animate="show" className="max-w-3xl">
            <motion.div variants={heroItem} className="mb-5 inline-flex rounded-full border border-[#f4b544]/30 bg-[#f4b544]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#ffd98a]">
              NutriOrder AI &middot; SmartPantry AI
            </motion.div>
            <motion.h1 variants={heroItem} className="max-w-3xl text-4xl font-black leading-[1.08] sm:text-5xl md:text-6xl lg:text-7xl">
              BiteWise
            </motion.h1>
            <motion.p variants={heroItem} className="mt-5 max-w-xl text-base sm:text-lg leading-7 sm:leading-8 text-white/70">
              One food intelligence platform. Two focused products. NutriOrder AI for health-aware meal ordering. SmartPantry AI for household pantry, recipe, and grocery intelligence.
            </motion.p>

            <motion.div variants={heroItem} className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {sessionLoading ? (
                <div className="h-12 w-48 rounded-xl bg-white/10 animate-pulse" />
              ) : sessionUser ? (
                <Link
                  href="/app"
                  className="rounded-xl bg-[#f4b544] px-7 py-3.5 text-sm font-black text-[#17211c] shadow-[0_12px_40px_rgba(244,181,68,0.25)] transition-all duration-200 hover:bg-[#ffd071] hover:shadow-[0_16px_50px_rgba(244,181,68,0.35)] hover:-translate-y-0.5 inline-block text-center"
                >
                  Open Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/app"
                    className="rounded-xl bg-[#f4b544] px-7 py-3.5 text-sm font-black text-[#17211c] shadow-[0_12px_40px_rgba(244,181,68,0.25)] transition-all duration-200 hover:bg-[#ffd071] hover:shadow-[0_16px_50px_rgba(244,181,68,0.35)] hover:-translate-y-0.5 inline-block text-center"
                  >
                    Get Started Free
                  </Link>
                  {showDemoCTA && (
                    <button
                      onClick={startDemo}
                      disabled={demoLoading || backendOffline}
                      className="rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold text-white transition-all duration-200 hover:border-white/40 hover:bg-white/10 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {demoLoading ? "Opening Sandbox" : "Try Sandbox Demo"}
                    </button>
                  )}
                  <Link
                    href="/pitch"
                    className="group rounded-xl border border-[#f4b544]/25 bg-[#f4b544]/8 px-7 py-3.5 text-sm font-bold text-[#ffd98a] transition-all duration-200 hover:border-[#f4b544]/50 hover:bg-[#f4b544]/14 hover:-translate-y-0.5 inline-flex items-center gap-1.5 text-center"
                  >
                    Watch the Demo
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </>
              )}
            </motion.div>

            {backendOffline && (
              <motion.div variants={heroItem} className="mt-6 max-w-xl rounded-xl border border-[#df6b57]/40 bg-[#df6b57]/12 px-5 py-4 text-sm text-[#ffd7cf] text-left">
                <p className="font-bold mb-2">Backend is waking up or offline. Render free tier may take ~30 seconds on first visit.</p>
                <p className="text-xs text-[#ffd7cf]/70">Refresh in a moment, or start the backend locally for instant response.</p>
              </motion.div>
            )}

            {message && !backendOffline && (
              <motion.p variants={heroItem} className="mt-5 max-w-xl rounded-xl border border-[#df6b57]/40 bg-[#df6b57]/12 px-5 py-3 text-sm text-[#ffd7cf]">
                {message}
              </motion.p>
            )}

            <motion.dl variants={heroItem} className="mt-10 grid max-w-lg grid-cols-2 sm:grid-cols-4 gap-4 text-white">
              {[
                ["2", "Focused products"],
                ["54+", "Verified tests"],
                ["6", "Intelligence layers"],
                ["0", "Unsafe mutations"],
              ].map(([num, label]) => (
                <div key={label} className="border-l border-white/15 pl-4">
                  <dt className="text-2xl font-black">
                    <StatCounter value={num} />
                  </dt>
                  <dd className="mt-0.5 text-[11px] text-white/50 leading-tight">{label}</dd>
                </div>
              ))}
            </motion.dl>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center lg:justify-end"
          >
            <PhoneMockup />
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30 animate-bounce">
          <span className="text-[10px] font-bold uppercase tracking-widest">Scroll</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
      </section>

      {/* Capability marquee */}
      <div className="border-y border-border-strong bg-surface-2 py-5">
        <MarqueeStrip items={CAPABILITY_CHIPS} />
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* NutriOrder AI — Detailed Section                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section id="nutriorder" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          {/* Left: Description */}
          <Reveal>
            <p className="text-xs font-black uppercase tracking-widest text-nutri">Product 01</p>
            <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-black leading-tight">NutriOrder AI</h2>
            <p className="mt-2 text-sm font-bold text-nutri">Health-aware meal ordering through Swiggy</p>
            <p className="mt-5 text-sm sm:text-base leading-7 text-muted">
              NutriOrder AI is the personal nutrition coach. You set your health profile — calories, protein targets, dietary preference, allergies, and budget — and the system finds the best-fit meals on Swiggy, explains why they rank high, and lets you order with full cart control.
            </p>
            <p className="mt-4 text-sm sm:text-base leading-7 text-muted">
              Every recommendation comes with an explainability breakdown: macro fit percentage, cost score, delivery time, taste profile, and availability. You see the reasoning, not just the result.
            </p>
          </Reveal>

          {/* Right: Live Interactive Showcase */}
          <Reveal delay={0.1}>
            <NutriOrderShowcase />
          </Reveal>
        </div>

        <Reveal className="mt-8">
          <Link
            href="/app/nutriorder"
            onClick={() => rememberChosenProduct("/app/nutriorder")}
            className="inline-flex items-center gap-2 rounded-xl bg-nutri px-6 py-3 text-sm font-black text-nutri-contrast shadow-lg transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5"
          >
            Try NutriOrder AI <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>

        {/* NutriOrder Key Features Grid */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {NUTRIORDER_FEATURES.map((feat, i) => (
            <Reveal key={feat.title} delay={i * 0.06}>
              <div className="rounded-xl border border-border-strong bg-surface p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
                <feat.icon className="h-6 w-6 text-nutri" strokeWidth={2} />
                <h4 className="mt-3 text-sm font-bold text-text">{feat.title}</h4>
                <p className="mt-1.5 text-xs leading-5 text-muted">{feat.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <hr className="border-border-strong" />
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SmartPantry AI — Detailed Section                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section id="smartpantry" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          {/* Left: Live Interactive Showcase */}
          <div className="order-2 lg:order-1">
            <Reveal delay={0.1}>
              <SmartPantryShowcase />
            </Reveal>
          </div>

          {/* Right: Description */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-28">
            <Reveal>
              <p className="text-xs font-black uppercase tracking-widest text-pantry">Product 02</p>
              <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-black leading-tight">SmartPantry AI</h2>
              <p className="mt-2 text-sm font-bold text-pantry">Household food intelligence for your kitchen</p>
              <p className="mt-5 text-sm sm:text-base leading-7 text-muted">
                SmartPantry AI manages the food lifecycle that happens between restaurant orders. It understands your kitchen: what&apos;s in stock, what&apos;s running low, what&apos;s expiring, what you can cook tonight, and what you need to buy.
              </p>
              <p className="mt-4 text-sm sm:text-base leading-7 text-muted">
                It&apos;s built for households — families where one person is vegetarian, another is allergic to peanuts, and everyone has different calorie needs. SmartPantry filters, plans, and restocks around all of those constraints.
              </p>
              <p className="mt-4 text-sm sm:text-base leading-7 text-muted">
                The intelligence is deterministic and rule-based — no LLM hallucinations, no API-key dependencies. Fast, testable, and reproducible recommendations every time.
              </p>
            </Reveal>

            {/* SmartPantry Differentiators */}
            <div className="mt-8 space-y-3">
              {SMARTPANTRY_DIFFERENTIATORS.map((d, i) => (
                <Reveal key={d.label} delay={i * 0.05}>
                  <div className="flex items-start gap-3 rounded-lg bg-surface-2 border border-pantry/10 p-3.5">
                    <d.icon className="h-5 w-5 mt-0.5 shrink-0 text-pantry" strokeWidth={2} />
                    <div>
                      <p className="text-sm font-bold text-text">{d.label}</p>
                      <p className="text-xs text-muted mt-0.5">{d.detail}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        <Reveal className="mt-8">
          <Link
            href="/app/smartpantry"
            onClick={() => rememberChosenProduct("/app/smartpantry")}
            className="inline-flex items-center gap-2 rounded-xl bg-pantry px-6 py-3 text-sm font-black text-pantry-contrast shadow-lg transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5"
          >
            Try SmartPantry AI <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>

        {/* SmartPantry Key Features Grid */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SMARTPANTRY_FEATURES.map((feat, i) => (
            <Reveal key={feat.title} delay={i * 0.05}>
              <div className="rounded-xl border border-border-strong bg-surface-2 p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
                <feat.icon className="h-6 w-6 text-pantry" strokeWidth={2} />
                <h4 className="mt-3 text-sm font-bold text-text">{feat.title}</h4>
                <p className="mt-1.5 text-xs leading-5 text-muted">{feat.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* How It Works — fixed dark brand band                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="relative overflow-hidden bg-[#17211c] px-5 py-16 text-white sm:px-8 sm:py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] bg-[size:30px_30px]" />
        <div className="relative mx-auto max-w-7xl">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-widest text-[#f4b544]">Operating model</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-black">One platform, two focused food products</h2>
            <p className="mt-4 text-sm leading-6 text-white/60">
              BiteWise keeps the experiences separate enough to feel clear, while sharing the same identity, safety patterns, and Swiggy MCP execution layer.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <Reveal key={step.num} delay={i * 0.08}>
                <article className="group h-full rounded-2xl border border-white/10 bg-white/5 p-6 transition-all duration-300 hover:border-[#f4b544]/30 hover:bg-white/8">
                  <p className="text-sm font-black text-[#f4b544] transition-transform duration-300 group-hover:scale-110 inline-block">{step.num}</p>
                  <h3 className="mt-4 text-base sm:text-lg font-black">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/55">{step.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Safety / Why This Works                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section id="safety" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <Reveal className="flex flex-col justify-center">
            <p className="text-xs font-black uppercase tracking-widest text-info">Why this direction works</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-black leading-tight">It becomes a food operating layer, not another ordering wrapper.</h2>
            <p className="mt-4 text-sm leading-7 text-muted">
              Most food apps solve one moment — ordering. BiteWise solves the full cycle: what to eat, what to cook, what to buy, and when to restock. The more a household uses it, the more accurate it gets.
            </p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {WHY_IT_WORKS.map(([title, body], i) => (
              <Reveal key={title} delay={i * 0.06}>
                <article className="group h-full rounded-2xl border border-border-strong bg-surface p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                  <h3 className="text-base sm:text-lg font-black text-text">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#17211c] text-white/35 text-xs text-center py-10 px-5 border-t border-white/6">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#f4b544] text-[10px] font-black text-[#17211c]">B</span>
            <span className="font-semibold text-white/50">BiteWise</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/pitch" className="text-white/40 hover:text-white/70 transition-colors">Demo</Link>
            <Link href="/app/nutriorder" onClick={() => rememberChosenProduct("/app/nutriorder")} className="text-white/40 hover:text-white/70 transition-colors">NutriOrder AI</Link>
            <Link href="/app/smartpantry" onClick={() => rememberChosenProduct("/app/smartpantry")} className="text-white/40 hover:text-white/70 transition-colors">SmartPantry AI</Link>
            <a href="https://github.com/samadarsh/BiteWise" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/70 transition-colors">GitHub</a>
          </div>
          <p className="text-white/30">© 2025 BiteWise</p>
        </div>
      </footer>
    </main>
  );
}
