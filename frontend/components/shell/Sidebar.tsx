"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Product {
  href: string;
  label: string;
  hint: string;
  accent: string;
  dot: string;
  activeBg: string;
  icon: React.ReactNode;
}

const PRODUCTS: Product[] = [
  {
    href: "/app/nutriorder",
    label: "NutriOrder AI",
    hint: "Order & coach",
    accent: "text-nutri",
    dot: "bg-nutri",
    activeBg: "bg-nutri/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3v6a2 2 0 0 0 2 2v10M7 3a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2M11 3v18M17 3a4 4 0 0 0-4 4v3a2 2 0 0 0 2 2h2v9" />
      </svg>
    ),
  },
  {
    href: "/app/smartpantry",
    label: "SmartPantry AI",
    hint: "Kitchen & grocery",
    accent: "text-pantry",
    dot: "bg-pantry",
    activeBg: "bg-pantry/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9h18l-1.5 10.5a2 2 0 0 1-2 1.5H6.5a2 2 0 0 1-2-1.5L3 9Z" />
        <path d="M8 9V6a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
];

interface SubNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const SUB_NAV: Record<string, SubNavItem[]> = {
  "/app/nutriorder": [
    {
      href: "/app/nutriorder/order",
      label: "Order",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      ),
    },
    {
      href: "/app/nutriorder/coach",
      label: "Coach",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
      ),
    },
    {
      href: "/app/nutriorder/orders",
      label: "Orders",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      ),
    },
    {
      href: "/app/nutriorder/preferences",
      label: "Preferences",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      ),
    },
  ],
  "/app/smartpantry": [
    {
      href: "/app/smartpantry/kitchen",
      label: "Kitchen",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18M5 12V5a1 1 0 0 1 1-1h4v8M13 12V4h5a1 1 0 0 1 1 1v7M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
        </svg>
      ),
    },
    {
      href: "/app/smartpantry/pantry",
      label: "Pantry",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="3" width="14" height="18" rx="1.5" />
          <path d="M5 9h14M5 15h14" />
        </svg>
      ),
    },
    {
      href: "/app/smartpantry/cook",
      label: "Cook",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M6 21V10a6 6 0 0 1 12 0v11" />
        </svg>
      ),
    },
    {
      href: "/app/smartpantry/grocery",
      label: "Grocery",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9h18l-1.5 10.5a2 2 0 0 1-2 1.5H6.5a2 2 0 0 1-2-1.5L3 9Z" />
          <path d="M8 9V6a4 4 0 0 1 8 0v3" />
        </svg>
      ),
    },
    {
      href: "/app/smartpantry/household",
      label: "Household",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M2.5 20a5.5 5.5 0 0 1 11 0M13 20a4.5 4.5 0 0 1 8.5-2" />
        </svg>
      ),
    },
  ],
};

/** Desktop-only sidebar with a workspace-style product switcher pinned below the header. */
export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = PRODUCTS.find((p) => pathname?.startsWith(p.href)) ?? PRODUCTS[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-border bg-surface/60 px-3 py-4 sticky top-14 sm:top-16 h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)]">
      <span className="px-1 pb-2 text-[10px] font-black uppercase tracking-wider text-subtle">Platform</span>

      <div className="relative" ref={rootRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="w-full flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2.5 hover:border-border-strong transition-colors"
        >
          <span className={`h-4 w-4 shrink-0 ${current.accent}`}>{current.icon}</span>
          <span className="flex-1 min-w-0 text-left">
            <span className={`block text-sm font-bold truncate ${current.accent}`}>{current.label}</span>
            <span className="block text-[10px] font-medium text-subtle truncate">{current.hint}</span>
          </span>
          <svg
            className={`h-3.5 w-3.5 text-subtle shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div role="menu" className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-lg border border-border bg-surface shadow-xl overflow-hidden">
            {PRODUCTS.map((p) => {
              const isActive = p.href === current.href;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors ${isActive ? p.activeBg : "hover:bg-surface-2"}`}
                >
                  <span className={`h-4 w-4 shrink-0 ${isActive ? p.accent : "text-subtle"}`}>{p.icon}</span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className={`block text-sm font-bold truncate ${isActive ? p.accent : "text-text"}`}>{p.label}</span>
                    <span className="block text-[10px] font-medium text-subtle truncate">{p.hint}</span>
                  </span>
                  {isActive && (
                    <svg className={`h-4 w-4 shrink-0 ${p.accent}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {SUB_NAV[current.href] && SUB_NAV[current.href].length > 0 && (
        <nav className="mt-4 flex flex-col gap-0.5">
          <span className="px-2.5 pb-1 text-[10px] font-black uppercase tracking-wider text-subtle">{current.label}</span>
          {SUB_NAV[current.href].map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors ${
                  isActive ? `${current.accent} ${current.activeBg}` : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <span className="h-4 w-4 shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </aside>
  );
}

/**
 * Compact horizontal switcher shown below the header on small screens, in
 * place of the sidebar. Includes the current product's sub-nav too — the
 * desktop Sidebar carries that, but it's hidden below md, so without this
 * a mobile user landing on e.g. Coach or Pantry has no way to reach its
 * sibling pages within the same product.
 */
export function MobileProductNav() {
  const pathname = usePathname();
  const current = PRODUCTS.find((p) => pathname?.startsWith(p.href)) ?? null;
  const subNav = current ? SUB_NAV[current.href] : undefined;

  return (
    <div className="flex flex-col gap-2 md:hidden">
      <nav className="grid grid-cols-2 gap-2">
        {PRODUCTS.map((item) => {
          const isActive = pathname?.startsWith(item.href) ?? false;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all duration-200 ${
                isActive ? `border-transparent ${item.activeBg}` : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${item.dot}`} />
              <span className={`text-xs font-bold truncate ${isActive ? item.accent : "text-text"}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {subNav && subNav.length > 0 && (
        <nav className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
          {subNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  isActive ? `${current!.accent} ${current!.activeBg}` : "text-muted bg-surface border border-border hover:border-border-strong"
                }`}
              >
                <span className="h-3.5 w-3.5 shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
