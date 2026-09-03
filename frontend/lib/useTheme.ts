"use client";
import { useCallback, useEffect, useState } from "react";

/** What the visitor asked for. "system" tracks the OS setting live. */
export type ThemePreference = "dark" | "light" | "system";
/** What's actually painted — always one of these two, never "system". */
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "rtdstats-theme";

function systemPrefersLight(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches;
}

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {
    /* storage unavailable (private mode) */
  }
  return "system";
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return systemPrefersLight() ? "light" : "dark";
  return pref;
}

function currentResolved(): ResolvedTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Reads/sets the theme preference ("dark" | "light" | "system" — First Train /
 * Last Train / Auto), persists it, and keeps the `<html data-theme>` flag (the
 * value every token in globals.css actually keys off) in sync — including live
 * updates to the OS setting while "system" is selected. Broadcasts a
 * `themechange` window event plus a MutationObserver so other subscribers
 * (useChartTheme, map basemap swapping) stay in sync too.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    setPreferenceState(readPreference());
    setResolvedTheme(currentResolved());
    const sync = () => setResolvedTheme(currentResolved());
    window.addEventListener("themechange", sync);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("themechange", sync);
      mo.disconnect();
    };
  }, []);

  const apply = useCallback((pref: ThemePreference) => {
    document.documentElement.dataset.theme = resolve(pref);
    window.dispatchEvent(new Event("themechange"));
  }, []);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      try {
        localStorage.setItem(STORAGE_KEY, pref);
      } catch {
        /* storage unavailable — the attribute still applies for this session */
      }
      apply(pref);
    },
    [apply],
  );

  // While "system" is selected, follow live OS theme changes.
  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference, apply]);

  return { preference, resolvedTheme, setPreference };
}
