"use client";
import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Reads / sets the `<html data-theme>` flag, persists the choice to
 * localStorage, and keeps every subscriber in sync via a `themechange`
 * window event plus a MutationObserver (so external changes propagate too).
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setThemeState(currentTheme());
    const sync = () => setThemeState(currentTheme());
    window.addEventListener("themechange", sync);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      window.removeEventListener("themechange", sync);
      mo.disconnect();
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable (private mode) — the attribute still applies */
    }
    window.dispatchEvent(new Event("themechange"));
  }, []);

  const toggle = useCallback(() => {
    setTheme(currentTheme() === "light" ? "dark" : "light");
  }, [setTheme]);

  return { theme, setTheme, toggle };
}
