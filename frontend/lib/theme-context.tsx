"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialised to "dark" for SSR; the pre-paint script in <head> sets the real
  // class before hydration, and the effect below syncs React state to it.
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("bitewise_theme")) as Theme | null;
    const system = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const initial = stored || system;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage/OS preference after hydration
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem("bitewise_theme", t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem("bitewise_theme", next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/** Inline script injected before paint to avoid a theme flash on first load. */
export const THEME_NO_FLASH_SCRIPT = `
(function(){try{var t=localStorage.getItem('bitewise_theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.setAttribute('data-theme',t);r.style.colorScheme=t;}catch(e){}})();
`;
