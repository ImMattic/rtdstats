"use client";
import { useEffect, useMemo, useState } from "react";

export interface ChartTheme {
  /** true once mounted and reading the real (non-default) resolved theme. */
  mode: "dark" | "light";
  grid: string;
  axis: string;
  text: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  reference: string;
  /** Signal accent triad, resolved from the active theme's tokens. */
  accent: string;
  ok: string;
  warn: string;
  danger: string;
}

/** Matches the dark token block in globals.css — used for SSR / first paint. */
const DARK_FALLBACK: ChartTheme = {
  mode: "dark",
  grid: "rgb(43 47 54)",
  axis: "rgb(124 131 142)",
  text: "rgb(162 168 178)",
  tooltipBg: "rgb(22 24 28)",
  tooltipBorder: "rgb(59 65 74)",
  tooltipText: "rgb(236 238 241)",
  reference: "rgb(59 65 74)",
  accent: "rgb(65 193 239)",
  ok: "rgb(0 148 131)",
  warn: "rgb(246 135 31)",
  danger: "rgb(240 62 72)",
};

function read(): ChartTheme {
  if (typeof window === "undefined") return DARK_FALLBACK;
  const isLight = document.documentElement.dataset.theme === "light";
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => {
    const raw = cs.getPropertyValue(name).trim();
    return raw ? `rgb(${raw})` : fallback;
  };
  return {
    mode: isLight ? "light" : "dark",
    grid: v("--line", DARK_FALLBACK.grid),
    axis: v("--fg-subtle", DARK_FALLBACK.axis),
    text: v("--fg-muted", DARK_FALLBACK.text),
    tooltipBg: v("--card", DARK_FALLBACK.tooltipBg),
    tooltipBorder: v("--line-2", DARK_FALLBACK.tooltipBorder),
    tooltipText: v("--fg", DARK_FALLBACK.tooltipText),
    reference: v("--line-2", DARK_FALLBACK.reference),
    accent: v("--accent", DARK_FALLBACK.accent),
    ok: v("--ok", DARK_FALLBACK.ok),
    warn: v("--warn", DARK_FALLBACK.warn),
    danger: v("--danger", DARK_FALLBACK.danger),
  };
}

/**
 * Structural chart colours (grid lines, axes, tooltip surface, the Signal
 * accent triad) resolved from the active theme's CSS variables. Recomputes
 * whenever the theme flips. Data-ramp functions in lib/utils.ts (onTimeColor,
 * headwayColor, etc.) take `mode` from here rather than reading vars directly,
 * since those values feed Recharts `fill`/style props, not className.
 */
export function useChartTheme(): ChartTheme {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    bump(); // first client read replaces the SSR fallback
    window.addEventListener("themechange", bump);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("themechange", bump);
      mo.disconnect();
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(), [tick]);
}
