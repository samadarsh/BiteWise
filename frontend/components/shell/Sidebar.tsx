"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  hint: string;
  accent: string;
  dot: string;
  activeBg: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/app/nutriorder",
    label: "NutriOrder AI",
    hint: "Order & coach",
    accent: "text-nutri",
    dot: "bg-nutri",
    activeBg: "border-nutri/40 bg-nutri/10",
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
    activeBg: "border-pantry/40 bg-pantry/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9h18l-1.5 10.5a2 2 0 0 1-2 1.5H6.5a2 2 0 0 1-2-1.5L3 9Z" />
        <path d="M8 9V6a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
];

/** Desktop-only persistent product rail, pinned below the header. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col w-56 shrink-0 gap-1 border-r border-border bg-surface/60 px-3 py-4 sticky top-14 sm:top-16 h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] overflow-y-auto">
      <span className="px-2.5 pb-2 text-[10px] font-black uppercase tracking-wider text-subtle">Products</span>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname?.startsWith(item.href) ?? false;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`group flex items-center gap-2.5 rounded-lg border px-2.5 py-2.5 transition-all duration-200 ${
              isActive ? item.activeBg : "border-transparent text-text hover:bg-surface-2"
            }`}
          >
            <span className={`h-4 w-4 shrink-0 ${isActive ? item.accent : "text-subtle group-hover:text-text"}`}>{item.icon}</span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className={`text-sm font-bold truncate ${isActive ? item.accent : "text-text"}`}>{item.label}</span>
              <span className="text-[10px] font-medium text-subtle truncate">{item.hint}</span>
            </span>
          </Link>
        );
      })}
    </aside>
  );
}

/** Compact horizontal switcher shown below the header on small screens, in place of the sidebar. */
export function MobileProductNav() {
  const pathname = usePathname();

  return (
    <nav className="grid grid-cols-2 gap-2 md:hidden">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname?.startsWith(item.href) ?? false;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all duration-200 ${
              isActive ? item.activeBg : "border-border bg-surface hover:border-border-strong"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${item.dot}`} />
            <span className={`text-xs font-bold truncate ${isActive ? item.accent : "text-text"}`}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
