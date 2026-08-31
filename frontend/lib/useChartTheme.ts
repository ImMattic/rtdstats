"use client";
import { useEffect, useMemo, useState } from "react";

export interface ChartTheme {
  grid: string;
  axis: string;
  text: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  reference: string;
  /** Primary data-series colour (the theme accent). */
  series: string;
  /** Faint fill for area/reference bands. */
  seriesFaint: string;
}

/** Matches the dark token block in globals.css — used for SSR / first paint. */
const DARK_FALLBACK: ChartTheme = {
  grid: "rgb(38 50 71)",
  axis: "rgb(107 122 147)",
  text: "rgb(154 167 189)",
  tooltipBg: "rgb(19 28 46)",
  tooltipBorder: "rgb(38 50 71)",
  tooltipText: "rgb(232 237 245)",
  reference: "rgb(107 122 147)",
  series: "rgb(90 166 238)",
  seriesFaint: "rgb(90 166 238 / 0.16)",
};

function read(): ChartTheme {
  if (typeof window === "undefined") return DARK_FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => {
    const raw = cs.getPropertyValue(name).trim();
    return raw ? `rgb(${raw})` : fallback;
  };
  const accentRaw = cs.getPropertyValue("--accent").trim();
  return {
    grid: v("--line", DARK_FALLBACK.grid),
    axis: v("--fg-subtle", DARK_FALLBACK.axis),
    text: v("--fg-muted", DARK_FALLBACK.text),
    tooltipBg: v("--card", DARK_FALLBACK.tooltipBg),
    tooltipBorder: v("--line", DARK_FALLBACK.tooltipBorder),
    tooltipText: v("--fg", DARK_FALLBACK.tooltipText),
    reference: v("--fg-subtle", DARK_FALLBACK.reference),
    series: accentRaw ? `rgb(${accentRaw})` : DARK_FALLBACK.series,
    seriesFaint: accentRaw ? `rgb(${accentRaw} / 0.16)` : DARK_FALLBACK.seriesFaint,
  };
}

/**
 * Structural chart colours (grid lines, axes, tooltip surface) resolved from
 * the active theme's CSS variables. Recomputes whenever the theme flips.
 * Data-series colours stay hard-coded in each chart — they read on both themes.
 */
export function useChartTheme(): ChartTheme {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("themechange", bump);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      window.removeEventListener("themechange", bump);
      mo.disconnect();
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(), [tick]);
}
