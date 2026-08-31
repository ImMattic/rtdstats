"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** Formats the tweened number for display. Default: rounded integer. */
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Eased count-up from 0 (on mount) or the previous value (on change). */
export default function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  durationMs = 700,
  className,
}: Props) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;

    if (from === to) {
      setDisplay(to);
      return;
    }
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return <span className={className}>{format(display)}</span>;
}
