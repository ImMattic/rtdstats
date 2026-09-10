"use client";
import { useEffect, useState } from "react";

/**
 * Track a CSS media query from React.
 *
 * Starts false on the server and on the first client render, then settles after
 * mount — so markup matches between the two and hydration stays quiet. Callers
 * that swap whole controls on the result should treat false as "not yet known"
 * and render the desktop branch, which works at any width.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * Phone-sized viewport — the same 640px boundary Tailwind's `sm:` uses, so a
 * component that swaps behaviour here stays in step with its own responsive
 * classes.
 */
export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 639px)");
}
